// Reply classifier.
//
// TODO(ai): This is a deterministic keyword-based stand-in. Phase 3 replaces it
// with the Claude reply classifier in packages/ai (reply_classification prompt
// version), which returns the same shape: one of the six categories plus a
// confidence score and short summary. Requires ANTHROPIC_API_KEY. The contract
// here (six labels, confidence in [0,1]) is intentionally identical so the
// service layer is unaffected by the swap.

// The six classification categories (SCHEMA.sql: replies.classification).
export type ReplyClassification =
  | 'interested'
  | 'objection'
  | 'out_of_office'
  | 'unsubscribe'
  | 'bounce'
  | 'unknown';

export interface ClassificationResult {
  classification: ReplyClassification;
  confidence: number; // 0..1
  summary: string;
}

interface Rule {
  classification: ReplyClassification;
  confidence: number;
  patterns: RegExp[];
}

// Ordered by priority: the first matching rule wins. Unsubscribe and bounce are
// checked first because they are safety/deliverability critical.
const RULES: Rule[] = [
  {
    classification: 'unsubscribe',
    confidence: 0.95,
    patterns: [
      /\bunsubscribe\b/i,
      /\bopt[\s-]?out\b/i,
      /\bremove me\b/i,
      /\btake me off\b/i,
      /\bstop (?:emailing|contacting|messaging)\b/i,
      /\bdo not (?:contact|email)\b/i,
      /\bno longer wish to (?:receive|hear)\b/i,
    ],
  },
  {
    classification: 'bounce',
    confidence: 0.9,
    patterns: [
      /\bdelivery (?:status notification|has failed)\b/i,
      /\bundeliverable\b/i,
      /\bmailer-daemon\b/i,
      /\baddress not found\b/i,
      /\brecipient.{0,20}(?:rejected|does not exist|not found)\b/i,
      /\b550[\s-]/i,
    ],
  },
  {
    classification: 'out_of_office',
    confidence: 0.9,
    patterns: [
      /\bout of (?:the )?office\b/i,
      /\bon (?:vacation|holiday|leave|annual leave|maternity|paternity)\b/i,
      /\bautomatic reply\b/i,
      /\bauto[\s-]?reply\b/i,
      /\bwill be back\b/i,
      /\baway from my desk\b/i,
      /\breturning on\b/i,
    ],
  },
  {
    classification: 'interested',
    confidence: 0.85,
    patterns: [
      /\b(?:sounds|looks) (?:good|great|interesting)\b/i,
      /\b(?:i'?m|we'?re) interested\b/i,
      /\bhappy to (?:chat|talk|connect|meet)\b/i,
      /\b(?:book|schedule|set up|setup) (?:a )?(?:call|meeting|demo|time)\b/i,
      /\b(?:let'?s|lets) (?:talk|chat|connect|meet|schedule)\b/i,
      /\btell me more\b/i,
      /\bwhat (?:are your|'?s the) (?:pricing|price|cost)\b/i,
      /\b(?:send|share) (?:me )?(?:more|the) (?:info|details|deck)\b/i,
      /\bcalendar\b/i,
    ],
  },
  {
    classification: 'objection',
    confidence: 0.75,
    patterns: [
      /\bnot (?:interested|a (?:good )?fit|right now|at this time)\b/i,
      /\bno thanks?\b/i,
      /\balready (?:have|use|using|working with)\b/i,
      /\bnot the right (?:person|time)\b/i,
      /\b(?:too expensive|no budget|out of budget)\b/i,
      /\bwrong (?:person|department|team)\b/i,
      /\bplease (?:reach out|contact) .{0,30}(?:instead|colleague)\b/i,
    ],
  },
];

// Classify a raw reply body into one of the six categories with a confidence
// score. Falls back to 'unknown' (low confidence) when no rule matches, which
// drives needs_human_review downstream.
export function classifyReply(rawBody: string | null | undefined): ClassificationResult {
  const text = (rawBody ?? '').trim();
  if (!text) {
    return { classification: 'unknown', confidence: 0.0, summary: 'Empty reply body' };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        classification: rule.classification,
        confidence: rule.confidence,
        summary: summarize(text),
      };
    }
  }

  return {
    classification: 'unknown',
    confidence: 0.4,
    summary: summarize(text),
  };
}

// Compact single-line summary (first ~140 chars) for the inbox/audit view.
function summarize(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
}
