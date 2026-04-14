export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow long-running Claude sessions

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';

// GET /api/projects/:id/chat — get chat history
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch last 200 messages (newest first), then reverse to chronological order
  const messages = await prisma.orchestratorChat.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json(messages.reverse());
}

// Build the system prompt with full project context
async function buildSystemPrompt(projectId: string) {
  const [project, tasks, missions, contexts, knowledge] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, description: true, status: true, claudeWorkDir: true, autoMission: true },
    }),
    prisma.task.findMany({
      where: { projectId },
      select: { id: true, title: true, status: true, priority: true, platform: true, taskType: true, description: true },
      take: 50,
    }),
    prisma.agentMission.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, title: true, status: true, targetService: true, missionType: true, result: true, errorMessage: true },
    }),
    prisma.projectContext.findMany({
      where: { projectId },
      select: { key: true, value: true, version: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.knowledgeBase.findMany({
      where: { projectId },
      select: { title: true, content: true, type: true },
      take: 15,
    }),
  ]);

  // De-duplicate contexts (latest version per key)
  const latestContexts = new Map<string, any>();
  contexts.forEach((c: any) => {
    if (!latestContexts.has(c.key)) latestContexts.set(c.key, c);
  });

  return `You are the **Orchestrator (Captain)** for the project "${project?.name || 'Unknown'}".

You are the central brain that manages this project. You can take real actions using tools — not just give advice.

## Your Role
- You are the team captain. The user talks to you, and sub-agents report to you.
- When the user asks you to do something, **DO IT** using the tools available. Don't just describe what could be done.
- When you need work executed on the user's local machine (file access, CLI commands, API calls), create a Mission.
- Track progress, create tasks, manage sub-agents, and keep the project context updated.

## Project Info
- **Name:** ${project?.name}
- **Description:** ${project?.description || 'N/A'}
- **Status:** ${project?.status}
- **Claude Working Directory:** ${project?.claudeWorkDir || 'Not configured'}
- **Auto-Mission:** ${project?.autoMission ? 'Enabled (can create missions directly)' : 'Disabled (should ask user before creating missions)'}

## Current Tasks (${tasks.length})
${tasks.map((t: any) => `- [${t.status}] (${t.priority}) ${t.title} ${t.platform ? '[' + t.platform + ']' : ''} {id: ${t.id}}`).join('\n') || 'No tasks yet'}

## Recent Missions (${missions.length})
${missions.map((m: any) => {
  let line = `- [${m.status}] ${m.title} (${m.targetService}) {id: ${m.id}}`;
  if (m.status === 'completed' && m.result) line += `\n  Result preview: ${m.result.substring(0, 300)}`;
  if (m.status === 'failed' && m.errorMessage) line += `\n  Error: ${m.errorMessage}`;
  return line;
}).join('\n') || 'No missions yet'}

## Project Context
${Array.from(latestContexts.values()).map((c: any) => `### ${c.key} (v${c.version})\n${c.value?.substring(0, 500)}`).join('\n\n') || 'No context entries yet'}

## Knowledge Base (${knowledge.length} entries)
${knowledge.map((k: any) => `- [${k.type}] ${k.title}: ${k.content?.substring(0, 200)}`).join('\n') || 'No knowledge entries yet'}

## Rules
- Respond in the same language as the user's message
- Be concise but thorough
- When you take an action (create task, mission, etc.), confirm what you did
- Use platform tags: GMC, ADS, META, GA4, GSC, KLV, SHPY
- For missions: write detailed, clear prompts that can be executed independently
- If auto-mission is disabled, ask user before creating missions
- Always use list_tasks or list_missions tools when you need current data
- When mission results come back, analyze them and suggest next steps
- You MUST use the MCP tools available to you (prefixed with mcp__taskflow-tools__) to take actions`;
}

// Resolve MCP server script path
function getMcpServerPath(): string {
  // In development, use tsx to run TypeScript directly
  // In production, use compiled JS
  const projectRoot = process.cwd();
  return path.join(projectRoot, 'mcp-server', 'index.ts');
}

// POST /api/projects/:id/chat — send message + Claude Agent SDK handles tool calling + stream response
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const projectId = params.id;

  // Save user message
  await prisma.orchestratorChat.create({
    data: { projectId, role: 'user', content: message.trim() },
  });

  // Build context
  const systemPrompt = await buildSystemPrompt(projectId);

  // Get recent chat for context
  const recentChat = await prisma.orchestratorChat.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  const chatHistory = recentChat
    .reverse()
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  // Build the full prompt with conversation history
  const fullPrompt = chatHistory
    ? `Previous conversation:\n${chatHistory}\n\nHuman: ${message.trim()}`
    : message.trim();

  // Resolve database URL for MCP server
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  const mcpServerScript = getMcpServerPath();

  // Stream response using SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const toolActions: Array<{ tool: string; args: any; result: { success: boolean; message: string; data: any } }> = [];
      let fullContent = '';

      try {
        // Use Claude Agent SDK with MCP server
        const agentStream = query({
          prompt: fullPrompt,
          options: {
            systemPrompt,
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
            allowedTools: ['mcp__taskflow-tools__*'],
            maxTurns: 5,
          },
        });

        for await (const event of agentStream) {
          if (event.type === 'assistant') {
            // Add paragraph break between assistant turns
            if (fullContent.length > 0 && !fullContent.endsWith('\n\n')) {
              fullContent += '\n\n';
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '\n\n' })}\n\n`));
            }
            const message = event.message;
            for (const block of message.content) {
              if (block.type === 'text') {
                fullContent += block.text;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: block.text })}\n\n`)
                );
              } else if (block.type === 'tool_use') {
                const toolName = (block.name || 'unknown').replace('mcp__taskflow-tools__', '');
                const toolArgs = block.input || {};
                toolActions.push({
                  tool: toolName,
                  args: toolArgs,
                  result: { success: true, message: `Tool ${toolName} called`, data: null },
                });
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ toolActions })}\n\n`)
                );
              }
            }
          } else if (event.type === 'stream_event') {
            // Streaming delta — partial text chunks
            const streamEvent = event.event;
            if (streamEvent.type === 'content_block_delta' && streamEvent.delta.type === 'text_delta') {
              const text = streamEvent.delta.text;
              fullContent += text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
              );
            }
          } else if (event.type === 'tool_progress') {
            // Tool execution progress — update frontend
            const toolName = (event.tool_name || '').replace('mcp__taskflow-tools__', '');
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ toolProgress: { tool: toolName, elapsed: event.elapsed_time_seconds } })}\n\n`)
            );
          } else if (event.type === 'result') {
            if (event.subtype === 'success' && event.result) {
              // Final result text (if not already captured via streaming)
              if (!fullContent && event.result) {
                fullContent = event.result;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: event.result })}\n\n`)
                );
              }
            } else if (event.subtype !== 'success') {
              // Error result
              const errorMsg = ('errors' in event && event.errors?.length) ? event.errors.join(', ') : 'An error occurred';
              fullContent += `\n\n⚠️ Error: ${errorMsg}`;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: `\n\n⚠️ Error: ${errorMsg}` })}\n\n`)
              );
            }
          }
        }

        // Save assistant message to DB
        if (fullContent) {
          const metadata = toolActions.length > 0 ? JSON.stringify({ toolActions }) : null;
          await prisma.orchestratorChat.create({
            data: { projectId, role: 'assistant', content: fullContent, metadata },
          });
        }

        // Log tool usage
        if (toolActions.length > 0) {
          await prisma.systemLog.create({
            data: {
              projectId,
              level: 'action',
              category: 'orchestrator',
              title: `Orchestrator executed ${toolActions.length} tool(s)`,
              details: JSON.stringify(toolActions.map(a => ({ tool: a.tool, success: a.result?.success }))),
            },
          }).catch((e: any) => console.error('[chat-route]', e.message));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error: any) {
        console.error('Claude Agent SDK error:', error);

        // Send error message
        const errorContent = `I encountered an error while processing your request. Please check that Claude CLI is installed and configured.\n\nError: ${error.message || 'Unknown error'}`;
        fullContent = errorContent;
        
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: errorContent })}\n\n`)
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));

        // Save error response
        await prisma.orchestratorChat.create({
          data: { projectId, role: 'assistant', content: errorContent },
        }).catch((e: any) => console.error('[chat-route]', e.message));
      } finally {
        controller.close();
      }
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

// DELETE /api/projects/:id/chat — clear chat history
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.orchestratorChat.deleteMany({ where: { projectId: params.id } });

  return NextResponse.json({ ok: true });
}
