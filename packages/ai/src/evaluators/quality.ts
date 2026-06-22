// Quality evaluator: scores a generated draft on overall quality and
// personalization before it enters the approval queue. Uses the active
// 'quality_eval' prompt (JSON mode); falls back to a heuristic score in mock
// mode.
import { callClaude } from '../client';
import { getActivePrompt, renderPrompt } from '../registry';
import { metaFrom, extractJson, clamp, type AiResult } from '../types';

export interface QualityInput {
  contactName: string;
  company?: string | null;
  subject: string;
  body: string;
  companyId?: string | null;
}

export type QualityResult = AiResult<{
  qualityScore: number; // 0..1
  personalizationScore: number; // 0..1
  notes: string;
}>;

interface RawQuality {
  quality_score?: number;
  personalization_score?: number;
  notes?: string;
}

// Heuristic scoring for mock mode: rewards addressing the contact/company and a
// reasonable length; penalises empty or extremely short bodies.
function mockQualityRaw(input: QualityInput): Required<RawQuality> {
  const body = input.body ?? '';
  const first = input.contactName.split(' ')[0] || input.contactName;
  const mentionsName = new RegExp(`\\b${first}\\b`, 'i').test(body);
  const mentionsCompany = Boolean(input.company) &&
    new RegExp(`\\b${input.company}\\b`, 'i').test(body);
  const lengthOk = body.length >= 120 && body.length <= 1200;

  const personalization = clamp(
    0.4 + (mentionsName ? 0.3 : 0) + (mentionsCompany ? 0.3 : 0),
    0,
    1,
  );
  const quality = clamp(
    0.4 + (lengthOk ? 0.3 : 0) + (input.subject ? 0.2 : 0) + (mentionsName ? 0.1 : 0),
    0,
    1,
  );
  const notes = [
    mentionsName ? 'addresses contact by name' : 'does not address contact by name',
    mentionsCompany ? 'references company' : 'no company reference',
    lengthOk ? 'length appropriate' : 'length off-target',
  ].join('; ');
  return {
    quality_score: Math.round(quality * 100) / 100,
    personalization_score: Math.round(personalization * 100) / 100,
    notes,
  };
}

export async function evaluateDraft(input: QualityInput): Promise<QualityResult> {
  const prompt = await getActivePrompt('quality_eval', input.companyId);

  const userContent = prompt
    ? renderPrompt(prompt.promptText, {
        contact_name: input.contactName,
        company: input.company ?? '',
        subject: input.subject,
        body: input.body,
      })
    : JSON.stringify(mockQualityRaw(input));

  const result = await callClaude({
    purpose: 'quality_eval',
    model: prompt?.modelName ?? 'claude-sonnet-4-6',
    maxTokens: prompt?.maxTokens ?? 500,
    temperature: prompt?.temperature ?? 0.2,
    userContent,
    promptVersionId: prompt?.id ?? null,
    mock: () => JSON.stringify(mockQualityRaw(input)),
  });

  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<RawQuality>(result.text) ?? mockQualityRaw(input);
  return {
    ok: true,
    qualityScore: clamp(Number(parsed.quality_score), 0, 1, 0.5),
    personalizationScore: clamp(Number(parsed.personalization_score), 0, 1, 0.5),
    notes: parsed.notes ? String(parsed.notes) : '',
    meta: metaFrom(result, prompt?.id ?? null),
  };
}
