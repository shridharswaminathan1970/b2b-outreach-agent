// The single entry point for every Claude API call (CLAUDE.md: "All Claude API
// calls go through packages/ai/src/client.ts — never call Anthropic directly").
//
// Responsibilities:
//   - transport to the Anthropic Messages API with exponential-backoff retries
//   - a deterministic MOCK fallback when no live API key is configured, so the
//     whole pipeline works offline / in tests
//   - per-call audit logging (prompt_version_id, model, in/out tokens, latency)
//   - NEVER throws: always returns a structured result object
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@outreach/db';
import { aiConfig, isLiveMode } from './config';

export interface ClaudeCall {
  purpose: string; // e.g. 'draft_generation' — used for the audit action
  model: string;
  maxTokens: number;
  temperature?: number;
  system?: string;
  userContent: string;
  promptVersionId?: string | null;
  // Entity this call is about (draft/reply id) for the audit row, if known.
  entityId?: string | null;
  // Deterministic stand-in output used when not in live mode. Closure over the
  // caller's inputs is expected.
  mock: () => string;
}

export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ClaudeResult =
  | {
      ok: true;
      text: string;
      usage: CallUsage;
      latencyMs: number;
      model: string;
      mode: 'live' | 'mock';
    }
  | { ok: false; error: { code: string; message: string } };

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: aiConfig.apiKey });
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Transient errors worth retrying: rate limits (429) and server errors (5xx).
function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
    return err.status === 429 || err.status >= 500;
  }
  // Network/connection errors (no status) are also retryable.
  return err instanceof Anthropic.APIConnectionError;
}

// Rough token estimate for mock mode (~4 chars/token), so downstream metrics have
// non-zero, proportional numbers without a live call.
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// Append-only audit row for one model invocation. Never throws into the caller.
async function logCall(
  call: ClaudeCall,
  outcome: {
    model: string;
    mode: 'live' | 'mock';
    usage: CallUsage;
    latencyMs: number;
    success: boolean;
    errorCode?: string;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'ai_call',
        entityId: call.entityId ?? call.promptVersionId ?? 'ai',
        action: `ai.${call.purpose}`,
        actorType: 'system',
        summary: `Claude ${call.purpose} (${outcome.mode}) ${outcome.success ? 'ok' : 'failed'}`,
        payloadJson: {
          promptVersionId: call.promptVersionId ?? null,
          model: outcome.model,
          mode: outcome.mode,
          inputTokens: outcome.usage.inputTokens,
          outputTokens: outcome.usage.outputTokens,
          latencyMs: outcome.latencyMs,
          success: outcome.success,
          ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
        },
      },
    });
  } catch {
    // Audit failures must never break the underlying AI operation.
  }
}

// Run one Claude call (or its mock) with retries + audit logging.
export async function callClaude(call: ClaudeCall): Promise<ClaudeResult> {
  const start = Date.now();

  // ── MOCK MODE ──────────────────────────────────────────────────────────────
  if (!isLiveMode()) {
    const text = safeMock(call);
    const usage: CallUsage = {
      inputTokens: estimateTokens((call.system ?? '') + call.userContent),
      outputTokens: estimateTokens(text),
    };
    const latencyMs = Date.now() - start;
    await logCall(call, { model: 'mock', mode: 'mock', usage, latencyMs, success: true });
    return { ok: true, text, usage, latencyMs, model: 'mock', mode: 'mock' };
  }

  // ── LIVE MODE (with exponential backoff) ─────────────────────────────────────
  const maxAttempts = Math.max(1, aiConfig.retry.attempts);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await getClient().messages.create({
        model: call.model,
        max_tokens: call.maxTokens,
        ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
        ...(call.system ? { system: call.system } : {}),
        messages: [{ role: 'user', content: call.userContent }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      const usage: CallUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
      const latencyMs = Date.now() - start;
      await logCall(call, {
        model: call.model,
        mode: 'live',
        usage,
        latencyMs,
        success: true,
      });
      return { ok: true, text, usage, latencyMs, model: call.model, mode: 'live' };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isRetryable(err)) {
        // Exponential backoff: base * 2^(attempt-1).
        await sleep(aiConfig.retry.baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      break;
    }
  }

  const code =
    lastError instanceof Anthropic.APIError && lastError.status
      ? `anthropic_${lastError.status}`
      : 'anthropic_error';
  const message =
    lastError instanceof Error ? lastError.message : 'Claude API call failed';
  const latencyMs = Date.now() - start;
  await logCall(call, {
    model: call.model,
    mode: 'live',
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs,
    success: false,
    errorCode: code,
  });
  return { ok: false, error: { code, message } };
}

// Guards the caller-supplied mock so a buggy stand-in can't throw past us.
function safeMock(call: ClaudeCall): string {
  try {
    return call.mock();
  } catch {
    return '';
  }
}
