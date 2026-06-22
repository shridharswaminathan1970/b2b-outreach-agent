// Versioned prompt registry. Prompts live in the DB (prompt_versions table) and
// are NEVER hardcoded in application code (CLAUDE.md). This loads the active
// prompt for a given purpose and renders {{variable}} placeholders.
import { prisma } from '@outreach/db';

export interface LoadedPrompt {
  id: string;
  name: string;
  purpose: string;
  promptText: string;
  modelName: string;
  maxTokens: number;
  temperature: number | null;
  version: number;
}

// Short-lived in-process cache: prompts change rarely and a stale entry for a few
// seconds is harmless. Cleared via clearPromptCache() after a prompt edit.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: LoadedPrompt; expires: number }>();

export function clearPromptCache(): void {
  cache.clear();
}

// Load the active prompt for a purpose (e.g. 'draft_generation',
// 'reply_classification', 'research_brief', 'quality_eval'). Multi-tenant: when a
// companyId is given, a company-specific override (companyId set) wins; otherwise
// the platform-global default (companyId NULL) is used. Returns null if neither
// exists, so callers can fall back gracefully rather than throw.
export async function getActivePrompt(
  purpose: string,
  companyId?: string | null,
): Promise<LoadedPrompt | null> {
  const cacheKey = `${companyId ?? 'global'}:${purpose}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  // Prefer a company override, then fall back to the global default.
  let row = companyId
    ? await prisma.promptVersion.findFirst({
        where: { purpose, isActive: true, companyId },
        orderBy: { version: 'desc' },
      })
    : null;
  if (!row) {
    row = await prisma.promptVersion.findFirst({
      where: { purpose, isActive: true, companyId: null },
      orderBy: { version: 'desc' },
    });
  }
  if (!row) return null;

  const value: LoadedPrompt = {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    promptText: row.promptText,
    modelName: row.modelName,
    maxTokens: row.maxTokens,
    temperature: row.temperature ? Number(row.temperature) : null,
    version: row.version,
  };
  cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// Substitute {{key}} placeholders with values; unknown placeholders become ''.
export function renderPrompt(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
