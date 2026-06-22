// AI layer configuration, read from environment. Mirrors ENV_SPEC.md
// (ANTHROPIC_*). No secrets are logged anywhere.
const PLACEHOLDER_KEY = 'sk-ant-api03-your-key-here';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const aiConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  models: {
    draft: process.env.ANTHROPIC_MODEL_DRAFT ?? 'claude-sonnet-4-6',
    classify: process.env.ANTHROPIC_MODEL_CLASSIFY ?? 'claude-haiku-4-5-20251001',
    research: process.env.ANTHROPIC_MODEL_RESEARCH ?? 'claude-sonnet-4-6',
  },
  maxTokens: {
    draft: num('ANTHROPIC_MAX_TOKENS_DRAFT', 1500),
    classify: num('ANTHROPIC_MAX_TOKENS_CLASSIFY', 300),
  },
  retry: {
    attempts: num('ANTHROPIC_RETRY_ATTEMPTS', 3),
    baseDelayMs: num('ANTHROPIC_RETRY_BASE_DELAY_MS', 1000),
  },
};

// True only when a usable, non-placeholder API key is configured. When false the
// client runs in deterministic mock mode (CLAUDE.md: fall back to a mock when the
// external key is unavailable). TODO: set ANTHROPIC_API_KEY to enable live calls.
export function isLiveMode(): boolean {
  const key = aiConfig.apiKey.trim();
  return key.length > 0 && key !== PLACEHOLDER_KEY && key.startsWith('sk-ant-');
}
