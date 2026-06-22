// Reply classifier: classifies an inbound reply into one of six categories with
// a confidence score. Uses the active 'reply_classification' prompt (JSON mode);
// falls back to a deterministic keyword classifier in mock mode. Per CLAUDE.md,
// confidence < 0.7 sets needsHumanReview.
import { callClaude } from '../client';
import { getActivePrompt, renderPrompt } from '../registry';
import { metaFrom, extractJson, clamp, type AiResult } from '../types';

export const REPLY_CATEGORIES = [
  'interested',
  'objection',
  'out_of_office',
  'unsubscribe',
  'bounce',
  'unknown',
] as const;
export type ReplyClassification = (typeof REPLY_CATEGORIES)[number];

export const CONFIDENCE_THRESHOLD = 0.7;

export type ClassifyResult = AiResult<{
  classification: ReplyClassification;
  confidence: number;
  summary: string;
  needsHumanReview: boolean;
}>;

interface RawClassification {
  classification?: string;
  confidence?: number;
  summary?: string;
}

function isCategory(value: unknown): value is ReplyClassification {
  return typeof value === 'string' && (REPLY_CATEGORIES as readonly string[]).includes(value);
}

// Deterministic keyword fallback (mirrors the API's Phase-2 stand-in contract).
function mockClassifyRaw(text: string): Required<RawClassification> {
  const t = text.toLowerCase();
  const summary = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  const has = (...ps: RegExp[]) => ps.some((p) => p.test(t));

  if (has(/\bunsubscribe\b/, /\bopt[\s-]?out\b/, /\bremove me\b/, /\bstop (emailing|contacting)\b/))
    return { classification: 'unsubscribe', confidence: 0.95, summary };
  if (has(/\bundeliverable\b/, /\bmailer-daemon\b/, /\baddress not found\b/, /\b550[\s-]/))
    return { classification: 'bounce', confidence: 0.9, summary };
  if (has(/\bout of (the )?office\b/, /\bon (vacation|leave|holiday)\b/, /\bauto(matic)?[\s-]?reply\b/))
    return { classification: 'out_of_office', confidence: 0.9, summary };
  if (has(/\binterested\b/, /\bhappy to (chat|talk|meet)\b/, /\b(book|schedule) a (call|meeting|demo)\b/, /\btell me more\b/))
    return { classification: 'interested', confidence: 0.85, summary };
  if (has(/\bnot (interested|a (good )?fit)\b/, /\bno thanks?\b/, /\balready (have|use|using)\b/, /\bwrong (person|team)\b/))
    return { classification: 'objection', confidence: 0.75, summary };
  return { classification: 'unknown', confidence: 0.4, summary: summary || 'Unclassified reply' };
}

function mockClassifyJson(text: string): string {
  return JSON.stringify(mockClassifyRaw(text));
}

export async function classifyReply(
  replyText: string,
  companyId?: string | null,
): Promise<ClassifyResult> {
  const text = (replyText ?? '').trim();
  const prompt = await getActivePrompt('reply_classification', companyId);

  const userContent = prompt
    ? renderPrompt(prompt.promptText, { reply_text: text })
    : mockClassifyJson(text);

  const result = await callClaude({
    purpose: 'reply_classification',
    model: prompt?.modelName ?? 'claude-haiku-4-5-20251001',
    maxTokens: prompt?.maxTokens ?? 300,
    temperature: prompt?.temperature ?? 0,
    userContent,
    promptVersionId: prompt?.id ?? null,
    mock: () => mockClassifyJson(text),
  });

  if (!result.ok) return { ok: false, error: result.error };

  // Parse the model's JSON; if anything is off, degrade to low-confidence unknown
  // (which forces human review) rather than throwing.
  const parsed = extractJson<RawClassification>(result.text);
  const classification: ReplyClassification = isCategory(parsed?.classification)
    ? parsed!.classification
    : 'unknown';
  const confidence = isCategory(parsed?.classification)
    ? clamp(Number(parsed?.confidence), 0, 1, 0.5)
    : 0.4;
  const summary =
    (parsed?.summary && String(parsed.summary)) || text.slice(0, 140) || 'Unclassified reply';

  return {
    ok: true,
    classification,
    confidence,
    summary,
    needsHumanReview: confidence < CONFIDENCE_THRESHOLD,
    meta: metaFrom(result, prompt?.id ?? null),
  };
}
