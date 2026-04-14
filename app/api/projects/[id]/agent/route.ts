export const dynamic = 'force-dynamic';
export const maxDuration = 600;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildOrchestratorPrompt } from '@/lib/orchestrator/system-prompt';
import { trackTokenUsage } from '@/lib/token-tracking';
import path from 'path';
import fs from 'fs';

function getMcpServerPath(): string {
  return path.join(process.cwd(), 'mcp-server', 'index.ts');
}

// Track last known rate limit across requests
let lastRateLimitInfo: { utilization?: number; resetsAt?: number; rateLimitType?: string; status?: string } | null = null;

// Track which projects have an active captain session
const activeProjects = new Map<string, { startedAt: number }>();

// ─── Background Agent Runner ───
// Runs Agent SDK query() independently of browser connection.
// SSE stream pipes events while open; if browser disconnects, agent keeps running.

interface AgentEvent {
  type: 'text' | 'tool' | 'tool_progress' | 'error' | 'done' | 'rate_limit';
  content?: string;
  tool?: string;
  args?: any;
  elapsed?: number;
  rateLimit?: {
    status: string;
    utilization?: number;
    resetsAt?: number;
    rateLimitType?: string;
  };
}

type EventListener = (event: AgentEvent) => void;

async function runAgentInBackground(
  projectId: string,
  userMessage: string,
): Promise<{ subscribe: (listener: EventListener) => () => void }> {
  const listeners = new Set<EventListener>();
  let isComplete = false;
  const bufferedEvents: AgentEvent[] = [];

  const emit = (event: AgentEvent) => {
    if (listeners.size > 0) {
      for (const listener of listeners) {
        try { listener(event); } catch { /* listener error — ignore */ }
      }
    }
    // Buffer events for late subscribers (not used now, but safe)
    if (!isComplete) bufferedEvents.push(event);
  };

  const subscribe = (listener: EventListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // Fire-and-forget: agent runs regardless of subscribers
  activeProjects.set(projectId, { startedAt: Date.now() });
  (async () => {
    const workspacePath = path.join(process.cwd(), 'workspaces', projectId);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    let systemPrompt = await buildOrchestratorPrompt(projectId, workspacePath);

    // Inject last known rate limit info into system prompt
    if (lastRateLimitInfo) {
      const resetStr = lastRateLimitInfo.resetsAt
        ? new Date(lastRateLimitInfo.resetsAt * 1000).toISOString()
        : 'unknown';
      const utilizationStr = lastRateLimitInfo.utilization != null
        ? `${Math.round(lastRateLimitInfo.utilization * 100)}%`
        : lastRateLimitInfo.status || 'unknown';
      systemPrompt += `\n\n--- CURRENT RATE LIMIT ---\nQuota: ${utilizationStr}\nStatus: ${lastRateLimitInfo.status}\nResets at: ${resetStr}\nType: ${lastRateLimitInfo.rateLimitType || 'unknown'}\n---`;
    }

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
      ? `Previous conversation:\n${chatHistory}\n\nHuman: ${userMessage}`
      : userMessage;

    const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
    const mcpServerScript = getMcpServerPath();

    let fullContent = '';

    try {
      const agentStream = query({
        prompt: fullPrompt,
        options: {
          agent: 'captain',
          agents: {
            captain: {
              description: 'Orchestrator Captain — PSNS Taskflow',
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
          allowedTools: ['mcp__taskflow-tools__*', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
          maxTurns: 100,
          permissionMode: 'acceptEdits',
        },
      });

      for await (const event of agentStream) {
        if (event.type === 'assistant') {
          // Add paragraph break between assistant turns (after tool calls)
          if (fullContent.length > 0 && !fullContent.endsWith('\n\n')) {
            fullContent += '\n\n';
            emit({ type: 'text', content: '\n\n' });
          }
          for (const block of event.message.content) {
            if (block.type === 'text') {
              fullContent += block.text;
              emit({ type: 'text', content: block.text });
            } else if (block.type === 'tool_use') {
              const toolName = (block.name || '').replace('mcp__taskflow-tools__', '');
              emit({ type: 'tool', tool: toolName, args: block.input });
            }
          }
        } else if (event.type === 'stream_event') {
          const se = event.event;
          if (se.type === 'content_block_delta' && se.delta.type === 'text_delta') {
            fullContent += se.delta.text;
            emit({ type: 'text', content: se.delta.text });
          }
        } else if (event.type === 'rate_limit_event') {
          const info = (event as any).rate_limit_info;
          if (info) {
            console.log(`[RateLimit] status=${info.status} utilization=${info.utilization} type=${info.rateLimitType} resetsAt=${info.resetsAt}`);
            lastRateLimitInfo = {
              utilization: info.utilization,
              resetsAt: info.resetsAt,
              rateLimitType: info.rateLimitType,
              status: info.status,
            };
            emit({
              type: 'rate_limit',
              rateLimit: {
                status: info.status,
                utilization: info.utilization,
                resetsAt: info.resetsAt,
                rateLimitType: info.rateLimitType,
              },
            });
          }
        } else if (event.type === 'tool_progress') {
          const toolName = (event.tool_name || '').replace('mcp__taskflow-tools__', '');
          emit({ type: 'tool_progress', tool: toolName, elapsed: event.elapsed_time_seconds });
        } else if (event.type === 'result') {
          console.log(`[Result] subtype=${event.subtype} hasResult=${!!(event as any).result} contentLen=${fullContent.length}`);
          if (event.subtype === 'success') {
            // Append result text if we don't have content yet
            if (event.result && !fullContent) {
              fullContent = event.result;
              emit({ type: 'text', content: event.result });
            }
          } else {
            // Error result (error_max_turns, error_max_budget, etc.)
            const errorMsg = ('errors' in event && event.errors?.length) ? event.errors.join(', ') : `Agent stopped: ${event.subtype}`;
            fullContent += `\n\n⚠️ ${errorMsg}`;
            emit({ type: 'error', content: errorMsg });
            console.error(`[Result-Error] ${event.subtype}: ${errorMsg}`);
          }

          // Track usage from result
          if ('usage' in event && event.usage) {
            const u = event.usage as any;
            await trackTokenUsage({
              projectId,
              model: 'claude-subscription',
              source: 'captain',
              promptTokens: u.input_tokens || u.inputTokens || 0,
              completionTokens: u.output_tokens || u.outputTokens || 0,
              totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0),
            }).catch((e: any) => console.error('[agent-route]', e.message));
          }
        }
      }
    } catch (error: any) {
      console.error('Agent SDK error:', error);
      const msg = error.message || 'Unknown error';

      // Detect rate limit / overload
      const isRateLimit = /rate.limit|overloaded|529|too many|quota|capacity/i.test(msg);
      const isTimeout = /timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg);

      let userMessage: string;
      if (isRateLimit) {
        userMessage = '⚠️ Captain is temporarily unavailable — Claude rate limit reached. Please wait a few minutes and try again.';
      } else if (isTimeout) {
        userMessage = '⚠️ Captain request timed out. The operation may have been too complex. Please try a simpler request or try again later.';
      } else {
        userMessage = `⚠️ Captain encountered an error: ${msg}`;
      }

      fullContent += userMessage;
      emit({ type: 'error', content: userMessage });

      // Save error as assistant message
      await prisma.orchestratorChat.create({
        data: { projectId, role: 'assistant', content: userMessage },
      }).catch((e: any) => console.error('[agent-route]', e.message));

      // Log to system logs
      await prisma.systemLog.create({
        data: {
          projectId,
          level: 'error',
          category: 'orchestrator',
          title: isRateLimit ? 'Rate limit reached' : isTimeout ? 'Request timeout' : 'Agent SDK error',
          details: msg.substring(0, 500),
        },
      }).catch((e: any) => console.error('[agent-route]', e.message));
    }

    // Save assistant response (always — regardless of browser connection)
    console.log(`[Save] fullContent length=${fullContent.length} projectId=${projectId}`);
    if (fullContent.trim()) {
      try {
        await prisma.orchestratorChat.create({
          data: { projectId, role: 'assistant', content: fullContent },
        });
        console.log(`[Save] Assistant message saved (${fullContent.length} chars)`);
      } catch (saveErr: any) {
        console.error(`[Save] FAILED to save assistant message: ${saveErr.message}`);
        // Retry once
        try {
          await prisma.orchestratorChat.create({
            data: { projectId, role: 'assistant', content: fullContent.substring(0, 50000) },
          });
          console.log(`[Save] Retry succeeded (truncated to 50k)`);
        } catch (retryErr: any) {
          console.error(`[Save] RETRY ALSO FAILED: ${retryErr.message}`);
        }
      }
    } else {
      // Agent produced no content — log this anomaly
      await prisma.orchestratorChat.create({
        data: { projectId, role: 'assistant', content: '⚠️ Captain did not produce a response. This may be due to a rate limit, timeout, or connection issue. Please try again.' },
      }).catch((e: any) => console.error('[agent-route]', e.message));
      await prisma.systemLog.create({
        data: { projectId, level: 'error', category: 'orchestrator', title: 'Captain produced no response', details: `User message: "${userMessage.substring(0, 200)}"` },
      }).catch((e: any) => console.error('[agent-route]', e.message));
    }

    // Retention: clean old messages
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.orchestratorChat.deleteMany({
      where: { projectId, createdAt: { lt: sevenDaysAgo } },
    }).catch((e: any) => console.error('[agent-route]', e.message));

    activeProjects.delete(projectId);
    isComplete = true;
    emit({ type: 'done' });
    listeners.clear();
  })().catch(async (err) => {
    console.error('Background agent fatal error:', err);
    // Save error to DB so it's visible even if browser disconnected
    await prisma.orchestratorChat.create({
      data: { projectId, role: 'assistant', content: `⚠️ Fatal error: ${err.message || 'Unknown error'}. Please try again.` },
    }).catch((e: any) => console.error('[agent-route]', e.message));
    await prisma.systemLog.create({
      data: { projectId, level: 'error', category: 'orchestrator', title: `Captain fatal error: ${err.message?.substring(0, 100)}`, details: err.stack?.substring(0, 500) },
    }).catch((e: any) => console.error('[agent-route]', e.message));
    activeProjects.delete(projectId);
    isComplete = true;
    emit({ type: 'error', content: `Fatal: ${err.message}` });
    emit({ type: 'done' });
    listeners.clear();
  });

  return { subscribe };
}

// GET /api/projects/:id/agent — check if captain is currently working
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const active = activeProjects.get(params.id);
  if (active) {
    const elapsed = Math.round((Date.now() - active.startedAt) / 1000);
    // Auto-clear stale sessions (>10 minutes)
    if (elapsed > 600) {
      activeProjects.delete(params.id);
      console.log(`[agent-route] Stale session cleared for ${params.id} (${elapsed}s)`);
      return NextResponse.json({ active: false });
    }
    return NextResponse.json({ active: true, elapsed });
  }
  return NextResponse.json({ active: false });
}

// POST /api/projects/:id/agent — Captain chat via Claude Agent SDK (subscription)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { message } = body;

  // Support both useChat format (messages array) and direct message format
  let userMessage = message;
  if (!userMessage && body.messages?.length) {
    const lastUser = [...body.messages].reverse().find((m: any) => m.role === 'user');
    userMessage = lastUser?.content || lastUser?.parts?.find((p: any) => p.type === 'text')?.text || '';
  }

  if (!userMessage?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const projectId = params.id;

  // Save user message
  await prisma.orchestratorChat.create({
    data: { projectId, role: 'user', content: userMessage.trim() },
  }).catch((e: any) => console.error('[agent-route]', e.message));

  // Start agent in background (runs independently of this SSE stream)
  const { subscribe } = await runAgentInBackground(projectId, userMessage.trim());

  // SSE stream: pipes events to browser while connection is open
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribe((event: AgentEvent) => {
        try {
          if (event.type === 'done') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Controller closed (browser disconnected) — agent keeps running
          unsubscribe();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
