export const dynamic = 'force-dynamic';
export const maxDuration = 600;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildOrchestratorPrompt } from '@/lib/orchestrator/system-prompt';
import { trackTokenUsage } from '@/lib/token-tracking';
import path from 'path';
import fs from 'fs';

// POST /api/internal/trigger-captain — auto-trigger captain for review
// Called by sub-agent worker after task completion
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== (process.env.INTERNAL_SECRET || 'taskflow-internal-2026')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId, message, agentActorId } = await req.json();
  if (!projectId || !message) {
    return NextResponse.json({ error: 'projectId and message required' }, { status: 400 });
  }

  // Save synthetic message from agent (not user)
  await prisma.orchestratorChat.create({
    data: { projectId, role: 'user', content: message, actorId: agentActorId || null },
  });

  // Run captain in background (fire-and-forget)
  runCaptainReview(projectId, message).catch((err) => {
    console.error('[trigger-captain] Fatal:', err.message);
  });

  return NextResponse.json({ success: true, message: 'Captain review triggered' });
}

async function runCaptainReview(projectId: string, triggerMessage: string): Promise<void> {
  const workspacePath = path.join(process.cwd(), 'workspaces', projectId);
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const captainActor = await prisma.actor.findFirst({ where: { type: 'SYSTEM' }, select: { id: true } });
  const captainActorId = captainActor?.id || null;

  const systemPrompt = await buildOrchestratorPrompt(projectId, workspacePath);

  // Get recent chat for context
  const recentChat = await prisma.orchestratorChat.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const chatHistory = recentChat
    .reverse()
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const fullPrompt = chatHistory
    ? `Previous conversation:\n${chatHistory}\n\nHuman: ${triggerMessage}`
    : triggerMessage;

  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  const mcpServerScript = path.join(process.cwd(), 'mcp-server', 'index.ts');

  let fullContent = '';

  try {
    console.log(`[trigger-captain] Starting auto-review for project ${projectId}`);

    const agentStream = query({
      prompt: fullPrompt,
      options: {
        agent: 'captain-review',
        agents: {
          'captain-review': {
            description: 'Captain Auto-Review — PSNS Taskflow',
            prompt: systemPrompt,
            model: 'opus',
            effort: 'max',
          },
        },
        mcpServers: {
          'taskflow-tools': {
            command: 'npx',
            args: ['tsx', mcpServerScript],
            env: {
              DATABASE_URL: dbUrl,
              PROJECT_ID: projectId,
            },
          },
        },
        allowedTools: ['mcp__taskflow-tools__*', 'Read', 'Glob', 'Grep'],
        maxTurns: 10,
        permissionMode: 'acceptEdits',
      },
    });

    for await (const event of agentStream) {
      if (event.type === 'assistant') {
        if (fullContent.length > 0 && !fullContent.endsWith('\n\n')) {
          fullContent += '\n\n';
        }
        for (const block of event.message.content) {
          if (block.type === 'text') {
            fullContent += block.text;
          }
        }
      } else if (event.type === 'result') {
        if (event.subtype === 'success' && event.result && !fullContent) {
          fullContent = event.result;
        }

        if ('usage' in event && event.usage) {
          const u = event.usage as any;
          await trackTokenUsage({
            projectId,
            model: 'claude-subscription',
            source: 'captain',
            promptTokens: u.input_tokens || 0,
            completionTokens: u.output_tokens || 0,
            totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0),
          }).catch((e: any) => console.error('[trigger-captain]', e.message));
        }
      }
    }
  } catch (err: any) {
    console.error('[trigger-captain] Agent error:', err.message);
    fullContent += `\n\n⚠️ Auto-review error: ${err.message}`;
  }

  // Save captain response
  if (fullContent.trim()) {
    try {
      await prisma.orchestratorChat.create({
        data: { projectId, role: 'assistant', actorId: captainActorId, content: fullContent },
      });
      console.log(`[trigger-captain] Review saved (${fullContent.length} chars)`);
    } catch (e: any) {
      console.error('[trigger-captain] Failed to save:', e.message);
    }
  } else {
    await prisma.orchestratorChat.create({
      data: { projectId, role: 'assistant', actorId: captainActorId, content: '⚠️ Auto-review produced no response.' },
    }).catch((e: any) => console.error('[trigger-captain]', e.message));
  }

  await prisma.systemLog.create({
    data: { projectId, level: 'action', category: 'orchestrator', title: 'Captain auto-review completed', details: `Content length: ${fullContent.length}` },
  }).catch((e: any) => console.error('[trigger-captain]', e.message));
}
