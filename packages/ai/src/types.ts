// Shared types + small helpers for the AI layer's public surface.
import type { ClaudeResult } from './client';

// The selling company's product/market definition. The platform is generic —
// nothing about any specific product is hardcoded; every AI generation is
// parameterised by this context, sourced from Company.settingsJson.product.
export interface ProductContext {
  productName: string; // e.g. "Acme Analytics"
  vendorName: string; // the company doing the selling, used in signatures
  category: string; // e.g. "revenue analytics platform"
  valueProp: string; // one-line value proposition
  market: string; // target market / segment
  icp: string; // ideal customer profile description
}

// A neutral fallback so generations still work before a company configures its
// product. Deliberately vendor-agnostic — no hardcoded product names.
export const GENERIC_PRODUCT: ProductContext = {
  productName: 'our solution',
  vendorName: 'our team',
  category: 'solution',
  valueProp: 'helping teams remove a costly operational bottleneck',
  market: 'your market',
  icp: 'teams facing this problem',
};

// Extract a ProductContext from an arbitrary Company.settingsJson blob. Reads
// settings.product.{...} with sensible fallbacks; never throws.
export function productContextFrom(settings: unknown): ProductContext {
  const root = (settings ?? {}) as Record<string, unknown>;
  const p = (root.product ?? root) as Record<string, unknown>;
  const str = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;
  return {
    productName: str(p.name ?? p.productName, GENERIC_PRODUCT.productName),
    vendorName: str(p.vendor ?? p.vendorName ?? root.vendorName, GENERIC_PRODUCT.vendorName),
    category: str(p.category, GENERIC_PRODUCT.category),
    valueProp: str(p.valueProp ?? p.value_proposition, GENERIC_PRODUCT.valueProp),
    market: str(p.market ?? root.market, GENERIC_PRODUCT.market),
    icp: str(p.icp ?? root.icp, GENERIC_PRODUCT.icp),
  };
}

// Per-call metadata returned to callers so they can persist token/latency metrics
// and the prompt version onto the relevant entity (e.g. Draft).
export interface AiMeta {
  promptVersionId: string | null;
  model: string;
  mode: 'live' | 'mock';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

// Standard structured result. AI functions never throw — they return ok:false.
export type AiResult<T> =
  | ({ ok: true; meta: AiMeta } & T)
  | { ok: false; error: { code: string; message: string } };

// Build an AiMeta from a successful ClaudeResult + the prompt version used.
export function metaFrom(
  result: Extract<ClaudeResult, { ok: true }>,
  promptVersionId: string | null,
): AiMeta {
  return {
    promptVersionId,
    model: result.model,
    mode: result.mode,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalTokens: result.usage.inputTokens + result.usage.outputTokens,
    latencyMs: result.latencyMs,
  };
}

// Extract the first balanced JSON object from a model response (handles models
// that wrap JSON in prose or ```json fences). Returns null on failure.
export function extractJson<T = unknown>(text: string): T | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// Clamp a number into [min, max]; returns fallback when not finite.
export function clamp(n: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
