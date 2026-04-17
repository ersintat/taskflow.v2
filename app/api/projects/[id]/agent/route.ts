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
// lastActivity updates on every event — used for stale detection (no events for 2 min = stale)
const activeProjects = new Map<string, { startedAt: number; lastActivity: number }>();
// Session cleared ONLY by: stream completion, error catch, or absolute max time
// No idle-based stale detection — Agent SDK produces no events during long tool calls
const MAX_SESSION_TIME = 45 * 60_000; // 45 minutes absolute max

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

interface ImageAttachment {
  base64: string;
  mediaType: string;
}

async function runAgentInBackground(
  projectId: string,
  userMessage: string,
  images?: ImageAttachment[],
): Promise<{ subscribe: (listener: EventListener) => () => void }> {
  const listeners = new Set<EventListener>();
  let isComplete = false;
  const bufferedEvents: AgentEvent[] = [];

  const emit = (event: AgentEvent) => {
    // Update last activity timestamp on every event
    const session = activeProjects.get(projectId);
    if (session) session.lastActivity = Date.now();

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

  // Get captain actorId (declared outside async for catch scope)
  let captainActorId: string | null = null;

  // Fire-and-forget: agent runs regardless of subscribers
  const now = Date.now();
  activeProjects.set(projectId, { startedAt: now, lastActivity: now });
  (async () => {
    const workspacePath = path.join(process.cwd(), 'workspaces', projectId);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    const captainActor = await prisma.actor.findFirst({ where: { type: 'SYSTEM' }, select: { id: true } });
    captainActorId = captainActor?.id || null;

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

    const textPrompt = chatHistory
      ? `Previous conversation:\n${chatHistory}\n\nHuman: ${userMessage}`
      : userMessage;

    const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
    const mcpServerScript = getMcpServerPath();

    let fullContent = '';

    // If images attached, save to workspace and tell captain to read them
    let prompt: string = textPrompt;
    if (images && images.length > 0) {
      const imageDir = path.join(workspacePath, 'user-images');
      if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

      const imagePaths: string[] = [];
      for (const img of images) {
        const ext = img.mediaType.split('/')[1] === 'jpeg' ? 'jpg' : img.mediaType.split('/')[1];
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const filePath = path.join(imageDir, filename);
        fs.writeFileSync(filePath, Buffer.from(img.base64, 'base64'));
        imagePaths.push(filePath);
      }

      const imageNote = imagePaths.length === 1
        ? `\n\n[The user attached an image. Read it with the Read tool: ${imagePaths[0]}]`
        : `\n\n[The user attached ${imagePaths.length} images. Read them with the Read tool:\n${imagePaths.map(p => `- ${p}`).join('\n')}]`;
      prompt = textPrompt + imageNote;
    }

    try {
      console.log(`[agent-route] Starting query() for ${projectId} — prompt length: ${typeof prompt === 'string' ? prompt.length : 'iterable'}`);

      const agentStream = query({
        prompt,
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
          allowedTools: ['mcp__taskflow-tools__*', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
          maxTurns: 100,
          permissionMode: 'acceptEdits',
        },
      });

      console.log(`[agent-route] Entering stream loop for ${projectId}`);
      let eventCount = 0;

      for await (const event of agentStream) {
        eventCount++;
        // Update lastActivity on EVERY event from SDK — prevents stale timeout during long tool calls
        const activeSession = activeProjects.get(projectId);
        if (activeSession) activeSession.lastActivity = Date.now();

        if (eventCount <= 3 || eventCount % 10 === 0) {
          console.log(`[agent-route] Event #${eventCount} type=${event.type} project=${projectId}`);
        }
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
      console.log(`[agent-route] Stream loop ended for ${projectId} — ${eventCount} events, content=${fullContent.length} chars`);
    } catch (error: any) {
      console.error(`[agent-route] Agent SDK error for ${projectId}:`, error.message, error.stack?.substring(0, 300));
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
        data: { projectId, role: 'assistant', actorId: captainActorId, content: userMessage },
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
          data: { projectId, role: 'assistant', actorId: captainActorId, content: fullContent },
        });
        console.log(`[Save] Assistant message saved (${fullContent.length} chars)`);
      } catch (saveErr: any) {
        console.error(`[Save] FAILED to save assistant message: ${saveErr.message}`);
        // Retry once
        try {
          await prisma.orchestratorChat.create({
            data: { projectId, role: 'assistant', actorId: captainActorId, content: fullContent.substring(0, 50000) },
          });
          console.log(`[Save] Retry succeeded (truncated to 50k)`);
        } catch (retryErr: any) {
          console.error(`[Save] RETRY ALSO FAILED: ${retryErr.message}`);
        }
      }
    } else {
      // Agent produced no content — log this anomaly
      await prisma.orchestratorChat.create({
        data: { projectId, role: 'assistant', actorId: captainActorId, content: '⚠️ Captain did not produce a response. This may be due to a rate limit, timeout, or connection issue. Please try again.' },
      }).catch((e: any) => console.error('[agent-route]', e.message));
      await prisma.systemLog.create({
        data: { projectId, level: 'error', category: 'orchestrator', title: 'Captain produced no response', details: `User message: "${userMessage.substring(0, 200)}"` },
      }).catch((e: any) => console.error('[agent-route]', e.message));
    }

    // Retention: clean old messages
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.orchestratorChat.deleteMany({
      where: { projectId, createdAt: { lt: thirtyDaysAgo } },
    }).catch((e: any) => console.error('[agent-route]', e.message));

    activeProjects.delete(projectId);
    isComplete = true;
    emit({ type: 'done' });
    listeners.clear();
  })().catch(async (err) => {
    console.error('Background agent fatal error:', err);
    // Save error to DB so it's visible even if browser disconnected
    await prisma.orchestratorChat.create({
      data: { projectId, role: 'assistant', actorId: captainActorId, content: `⚠️ Fatal error: ${err.message || 'Unknown error'}. Please try again.` },
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
    const now = Date.now();
    const elapsed = Math.round((now - active.startedAt) / 1000);

    // Only absolute max timeout clears from GET — agent SDK handles its own completion
    if ((now - active.startedAt) > MAX_SESSION_TIME) {
      activeProjects.delete(params.id);
      console.log(`[agent-route] Max session time reached for ${params.id} (${elapsed}s)`);
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
  const { message, images: rawImages } = body;

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

  // Check if captain is already running for this project
  const existingSession = activeProjects.get(projectId);
  if (existingSession) {
    const totalElapsed = Date.now() - existingSession.startedAt;
    if (totalElapsed < MAX_SESSION_TIME) {
      // Captain is still within max time — save message, don't start duplicate
      const userEmail2 = session?.user?.email;
      const userActor2 = userEmail2 ? await prisma.actor.findFirst({
        where: { email: userEmail2, type: 'HUMAN' }, select: { id: true },
      }).catch(() => null) : null;
      await prisma.orchestratorChat.create({
        data: { projectId, role: 'user', content: userMessage.trim(), actorId: userActor2?.id || null },
      }).catch((e: any) => console.error('[agent-route]', e.message));

      return NextResponse.json({
        error: `Captain is currently working (${Math.round(totalElapsed / 1000)}s). Your message has been saved and will be seen in the next session.`,
      }, { status: 409 });
    }
    // Max time exceeded — clear and start fresh
    activeProjects.delete(projectId);
    console.log(`[agent-route] Max session time exceeded, clearing for ${projectId} (${Math.round(totalElapsed / 1000)}s)`);
  }

  // Find user's actor ID (by email match)
  const userEmail = session?.user?.email;
  const userActor = userEmail ? await prisma.actor.findFirst({
    where: { email: userEmail, type: 'HUMAN' },
    select: { id: true },
  }).catch(() => null) : null;
  // Fallback: find by name
  const userActorId = userActor?.id || (session?.user?.name ? (await prisma.actor.findFirst({
    where: { name: session.user.name, type: 'HUMAN' },
    select: { id: true },
  }).catch(() => null))?.id : null) || null;

  // Save user message
  await prisma.orchestratorChat.create({
    data: { projectId, role: 'user', content: userMessage.trim(), actorId: userActorId },
  }).catch((e: any) => console.error('[agent-route]', e.message));

  // Parse image attachments
  const imageAttachments: ImageAttachment[] = (rawImages || [])
    .filter((img: any) => img.base64 && img.mediaType)
    .map((img: any) => ({ base64: img.base64, mediaType: img.mediaType }));

  // Start agent in background (runs independently of this SSE stream)
  const { subscribe } = await runAgentInBackground(projectId, userMessage.trim(), imageAttachments.length > 0 ? imageAttachments : undefined);

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
