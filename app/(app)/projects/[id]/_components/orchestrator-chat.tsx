'use client';

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Bot, User, Send, Loader2, Sparkles, TerminalSquare, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { tool: string; args: any }[];
  createdAt?: Date;
}

// Avatar component for chat bubbles
function ChatAvatar({ role, avatarUrl, fallbackIcon }: { role: 'user' | 'assistant'; avatarUrl?: string | null; fallbackIcon: 'user' | 'bot' }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={role}
        className="h-8 w-8 rounded-full object-cover shrink-0 border border-border/30"
      />
    );
  }
  return (
    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${role === 'user' ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
      {fallbackIcon === 'user' ? <User className="h-4 w-4 text-white" /> : <Sparkles className="h-4 w-4 text-white" />}
    </div>
  );
}

// Memoized message bubble — prevents re-rendering all messages on input change
const ChatBubble = memo(function ChatBubble({ msg, formatTimestamp, userAvatarUrl, botAvatarUrl }: {
  msg: ChatMessage;
  formatTimestamp: (d?: any) => string;
  userAvatarUrl?: string | null;
  botAvatarUrl?: string | null;
}) {
  return (
    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
      <ChatAvatar
        role={msg.role}
        avatarUrl={msg.role === 'user' ? userAvatarUrl : botAvatarUrl}
        fallbackIcon={msg.role === 'user' ? 'user' : 'bot'}
      />
      <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-zinc-800 text-slate-200' : 'bg-indigo-950/30 text-slate-300 border border-indigo-500/10'}`}>
          <div className="chat-markdown text-[13px]" style={{ fontFamily: '"SF Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <details className="mt-2">
              <summary className="flex items-center gap-2 text-[11px] font-mono cursor-pointer py-1.5 px-2.5 rounded bg-black/30 hover:bg-black/50 text-slate-400">
                <TerminalSquare className="h-3 w-3 text-emerald-500 shrink-0" />
                <span>{msg.toolCalls.length} tool call</span>
                <span className="text-slate-600 ml-auto">{msg.toolCalls.map(t => t.tool).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
              </summary>
              <div className="mt-1 space-y-0.5 pl-2 border-l border-indigo-500/20 ml-1">
                {msg.toolCalls.map((tc, i) => (
                  <div key={i} className="text-[10px] font-mono text-slate-500 py-0.5 px-2">{tc.tool}</div>
                ))}
              </div>
            </details>
          )}
        </div>
        <span className="text-[10px] text-zinc-500 px-1">{formatTimestamp(msg.createdAt)}</span>
      </div>
    </div>
  );
});

export function OrchestratorChat({ projectId }: { projectId: string }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTools, setStreamingTools] = useState<{ tool: string; args: any }[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captainAvatar, setCaptainAvatar] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession() || {};
  const userImage = (session?.user as any)?.image ?? null;

  // Load captain avatar (Orchestrator actor)
  useEffect(() => {
    fetch('/api/actors')
      .then(r => r.ok ? r.json() : [])
      .then((actors: any[]) => {
        const orch = actors.find((a: any) => a.type === 'SYSTEM' || a.name === 'Orchestrator');
        if (orch?.avatarUrl) setCaptainAvatar(orch.avatarUrl);
      })
      .catch(() => {});
  }, []);

  // Load chat history from DB
  const loadHistory = useCallback(() => {
    fetch(`/api/projects/${projectId}/chat`)
      .then(res => res.ok ? res.json() : Promise.reject('unauthorized'))
      .then((history: any[]) => {
        if (!Array.isArray(history)) return;
        const msgs = history
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any, idx: number) => ({
            id: m.id || `h-${idx}`,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            createdAt: new Date(m.createdAt),
          }));
        setMessages(msgs);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [projectId]);

  // Load on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reload when tab becomes visible (user switched away and came back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isLoading) {
        loadHistory();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadHistory, isLoading]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, isLoading]);

  // Send message via SSE
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    setStreamingTools([]);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let accumulated = '';
      const tools: { tool: string; args: any }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'text' && parsed.content) {
              accumulated += parsed.content;
              setStreamingContent(accumulated);
            } else if (parsed.type === 'tool') {
              tools.push({ tool: parsed.tool, args: parsed.args });
              setStreamingTools([...tools]);
            } else if (parsed.type === 'error') {
              setError(parsed.content);
            }
            // Legacy format (from chat route)
            else if (parsed.content && !parsed.type) {
              accumulated += parsed.content;
              setStreamingContent(accumulated);
            }
          } catch { /* skip invalid JSON */ }
        }
      }

      // Add completed assistant message
      if (accumulated.trim()) {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: accumulated,
          toolCalls: tools.length > 0 ? tools : undefined,
          createdAt: new Date(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        // Stream ended with no text — agent may still be running in background
        // Retry loading from DB: immediate + 3s + 8s
        const retryLoad = () => loadHistory();
        retryLoad();
        setTimeout(retryLoad, 3000);
        setTimeout(retryLoad, 8000);
      }
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      setStreamingTools([]);
    }
  }, [input, isLoading, projectId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClearHistory = useCallback(async () => {
    if (!confirm('All chat history will be deleted. Are you sure?')) return;
    try {
      await fetch(`/api/projects/${projectId}/chat`, { method: 'DELETE' });
      setMessages([]);
    } catch { /* ignore */ }
  }, [projectId]);

  const formatTimestamp = useCallback((date?: Date | number | string) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ` ${time}`;
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {captainAvatar ? (
            <img src={captainAvatar} alt="Captain" className="h-8 w-8 rounded-lg object-cover border border-border" />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Sparkles className="h-4.5 w-4.5 text-indigo-500" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Orchestrator Captain
              <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Claude Opus 4.5
              </span>
            </h3>
            <p className="text-[10px] text-muted-foreground">PSNS Taskflow Orchestrator</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearHistory} className="text-xs text-muted-foreground hover:text-destructive gap-1">
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 rounded-xl overflow-y-auto border border-border bg-[#0d0d0d] p-4 shadow-inner flex flex-col gap-4 custom-scrollbar">
        {messages.length === 0 && !isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            {captainAvatar ? (
              <img src={captainAvatar} alt="Captain" className="h-14 w-14 rounded-full object-cover border border-border/30 mb-3 opacity-40" />
            ) : (
              <Sparkles className="h-10 w-10 mb-3 opacity-20" />
            )}
            <p className="text-sm">Captain Active (Claude Subscription)</p>
            <p className="text-xs opacity-50">Orchestrator ready. What are we working on?</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} formatTimestamp={formatTimestamp} userAvatarUrl={userImage} botAvatarUrl={captainAvatar} />
            ))}

            {/* Streaming content */}
            {isLoading && (streamingContent || streamingTools.length > 0) && (
              <div className="flex gap-3">
                <ChatAvatar role="assistant" avatarUrl={captainAvatar} fallbackIcon="bot" />
                <div className="flex flex-col gap-1 max-w-[80%] items-start">
                  <div className="rounded-lg px-4 py-2 bg-indigo-950/30 text-slate-300 border border-indigo-500/10">
                    {streamingContent && (
                      <div className="chat-markdown text-[13px]" style={{ fontFamily: '"SF Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                      </div>
                    )}
                    {streamingTools.length > 0 && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] font-mono py-1.5 px-2.5 rounded bg-black/30 text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin text-indigo-500 shrink-0" />
                        <span>{streamingTools.length} tool running</span>
                        <span className="text-indigo-400 ml-1">{streamingTools[streamingTools.length - 1]?.tool}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator (no content yet) */}
            {isLoading && !streamingContent && streamingTools.length === 0 && (
              <div className="flex gap-3">
                <ChatAvatar role="assistant" avatarUrl={captainAvatar} fallbackIcon="bot" />
                <div className="rounded-lg px-4 py-3 bg-indigo-950/30 border border-indigo-500/10">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="rounded-md bg-red-950/40 border border-red-500/30 p-3 text-xs font-mono text-red-200">
            <div className="font-bold text-red-400 mb-1">Error:</div>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message to Captain..."
          disabled={isLoading}
          rows={Math.min(Math.max(input.split('\n').length, 1), 5)}
          className="flex-1 bg-card border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring custom-scrollbar"
          style={{ minHeight: '40px' }}
        />
        <Button type="submit" disabled={isLoading || !input.trim()} className="h-10 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
