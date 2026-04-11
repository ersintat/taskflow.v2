import { prisma } from '@/lib/db';

// Model pricing (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude models
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-20250414': { input: 0.80, output: 4.0 },
  // Gemini models (kept for historical data)
  'gemini-3.1-pro-preview': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

interface TokenUsageParams {
  projectId?: string | null;
  actorId?: string | null;
  model: string;
  source: 'captain' | 'sub_agent';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  taskId?: string | null;
}

export async function trackTokenUsage(params: TokenUsageParams): Promise<void> {
  try {
    await prisma.tokenUsage.create({
      data: {
        projectId: params.projectId || null,
        actorId: params.actorId || null,
        model: params.model,
        source: params.source,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens: params.totalTokens,
        estimatedCostUsd: estimateCost(params.model, params.promptTokens, params.completionTokens),
        taskId: params.taskId || null,
      },
    });
  } catch { /* non-blocking */ }
}
