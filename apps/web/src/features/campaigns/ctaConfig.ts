// CTA touch types + their type-specific fields. The `key`s match what the AI
// draft generator reads (packages/ai ctaSummary), so renaming here means
// renaming there too.
export type CtaType = 'webinar' | 'demo' | 'case_study' | 'free_trial';

export const CTA_LABELS: Record<CtaType, string> = {
  webinar: 'Webinar',
  demo: 'Demo / Meeting',
  case_study: 'Case study / Resource',
  free_trial: 'Free trial / Pilot',
};

export interface CtaField {
  key: string;
  label: string;
  type?: 'text' | 'datetime-local';
  placeholder?: string;
}

export const CTA_FIELDS: Record<CtaType, CtaField[]> = {
  webinar: [
    { key: 'webinar_title', label: 'Webinar title', placeholder: 'Scaling Ops Without Scaling Headcount' },
    { key: 'webinar_date', label: 'Date & time', type: 'datetime-local' },
    { key: 'registration_link', label: 'Registration link', placeholder: 'https://…' },
    { key: 'host', label: 'Host / speaker', placeholder: 'Jane Doe, VP Product' },
    { key: 'description', label: 'Short description', placeholder: 'What attendees will learn' },
  ],
  demo: [
    { key: 'meeting_type', label: 'Meeting type', placeholder: 'Product demo / discovery call' },
    { key: 'duration', label: 'Duration', placeholder: '30 min' },
    { key: 'booking_link', label: 'Booking link', placeholder: 'https://calendly.com/…' },
    { key: 'agenda', label: 'Proposed agenda', placeholder: 'What you’ll cover' },
  ],
  case_study: [
    { key: 'asset_title', label: 'Asset title', placeholder: 'How Acme cut cycle time 40%' },
    { key: 'asset_url', label: 'Asset URL', placeholder: 'https://…' },
    { key: 'outcome', label: 'One-line outcome / result', placeholder: '40% faster turnaround in 90 days' },
    { key: 'gated', label: 'Gated? (yes / no)', placeholder: 'no' },
  ],
  free_trial: [
    { key: 'offer_name', label: 'Offer name', placeholder: '14-day Pro trial' },
    { key: 'trial_length', label: 'Trial length', placeholder: '14 days' },
    { key: 'signup_link', label: 'Signup link', placeholder: 'https://…' },
    { key: 'activation_step', label: 'Key activation step', placeholder: 'Connect your data source' },
  ],
};

export const TRUST_RATIO = 0.8;
// Touch-type rotation across the trust (80%) block.
export const TRUST_ROTATION = ['Trust Builder', 'Value Add', 'Intel Gathering'] as const;

// Mirror of the server split: CTA block is the final ~20% (always ≥1).
export function splitTouches(total: number): { trustCount: number; ctaCount: number } {
  const ctaCount = Math.min(total, Math.max(1, Math.round(total * (1 - TRUST_RATIO))));
  return { trustCount: total - ctaCount, ctaCount };
}

export function trustTypeFor(index: number): string {
  return TRUST_ROTATION[index % TRUST_ROTATION.length];
}
