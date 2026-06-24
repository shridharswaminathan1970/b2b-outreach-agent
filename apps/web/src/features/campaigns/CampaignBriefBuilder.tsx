import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Package, UserSquare2, ListOrdered, Rocket } from 'lucide-react';
import { apiPost, apiError } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  CTA_FIELDS,
  CTA_LABELS,
  TRUST_RATIO,
  splitTouches,
  trustTypeFor,
  type CtaType,
} from './ctaConfig';

const SENIORITIES = ['C-Suite', 'VP', 'Director', 'Manager'];

const STEPS = [
  { id: 1, label: 'Product Brief', icon: Package },
  { id: 2, label: 'Buyer Persona', icon: UserSquare2 },
  { id: 3, label: 'Sequence', icon: ListOrdered },
  { id: 4, label: 'Review', icon: Rocket },
];

interface ProductBrief {
  productName: string;
  productPurpose: string;
  targetCustomer: string;
  u1Unworkable: string;
  u2Urgent: string;
  u3Unavoidable: string;
  u4Underserved: string;
  positioningStatement: string;
}
interface Persona {
  industry: string;
  companySize: string;
  economicBuyerName: string;
  economicBuyerDesignation: string;
  economicBuyerSeniority: string;
  economicBuyerEmail: string;
  coDecisionMakerName: string;
  coDecisionMakerDesignation: string;
  coDecisionMakerEmail: string;
}
interface CtaTouch {
  ctaType: CtaType | '';
  config: Record<string, string>;
}

const EMPTY_PRODUCT: ProductBrief = {
  productName: '', productPurpose: '', targetCustomer: '',
  u1Unworkable: '', u2Urgent: '', u3Unavoidable: '', u4Underserved: '', positioningStatement: '',
};
const EMPTY_PERSONA: Persona = {
  industry: '', companySize: '', economicBuyerName: '', economicBuyerDesignation: '',
  economicBuyerSeniority: '', economicBuyerEmail: '', coDecisionMakerName: '',
  coDecisionMakerDesignation: '', coDecisionMakerEmail: '',
};

const PRODUCT_FIELDS: { key: keyof ProductBrief; label: string; hint: string }[] = [
  { key: 'productName', label: 'Product / solution name', hint: 'What is it called?' },
  { key: 'productPurpose', label: 'What does it do?', hint: '2–3 sentences on what the product does.' },
  { key: 'targetCustomer', label: 'Who is it for?', hint: 'The ideal customer.' },
  { key: 'u1Unworkable', label: 'Unworkable — what is broken/painful without it?', hint: '' },
  { key: 'u2Urgent', label: 'Urgent — why solve this now?', hint: '' },
  { key: 'u3Unavoidable', label: 'Unavoidable — why can they not ignore it?', hint: '' },
  { key: 'u4Underserved', label: 'Underserved — why are current solutions failing them?', hint: '' },
  { key: 'positioningStatement', label: 'Positioning — how does this make itself inevitable?', hint: '' },
];

// Build/resize the CTA touch list to match the computed CTA count, preserving
// existing configs.
function resizeCtas(prev: CtaTouch[], ctaCount: number): CtaTouch[] {
  const next = prev.slice(0, ctaCount);
  while (next.length < ctaCount) next.push({ ctaType: '', config: {} });
  return next;
}

export function CampaignBriefBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [product, setProduct] = useState<ProductBrief>(EMPTY_PRODUCT);
  const [persona, setPersona] = useState<Persona>(EMPTY_PERSONA);
  const [total, setTotal] = useState(9);
  const [ctas, setCtas] = useState<CtaTouch[]>(() => resizeCtas([], splitTouches(9).ctaCount));

  const { trustCount, ctaCount } = useMemo(() => splitTouches(total), [total]);

  function setTotalTouchpoints(v: number) {
    const clamped = Math.max(1, Math.min(30, v || 1));
    setTotal(clamped);
    setCtas((prev) => resizeCtas(prev, splitTouches(clamped).ctaCount));
  }
  function setCta(i: number, patch: Partial<CtaTouch>) {
    setCtas((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function setCtaField(i: number, key: string, value: string) {
    setCtas((prev) => prev.map((c, idx) => (idx === i ? { ...c, config: { ...c.config, [key]: value } } : c)));
  }

  const create = useMutation({
    mutationFn: () => {
      // Drop empty persona fields so optional/email validation passes.
      const buyerPersona = Object.fromEntries(
        Object.entries(persona).filter(([, v]) => v.trim()),
      );
      const strategy = {
        totalTouchpoints: total,
        trustRatio: TRUST_RATIO,
        ctaTouches: ctas.map((c) => ({
          ctaType: c.ctaType,
          config: Object.fromEntries(Object.entries(c.config).filter(([, v]) => v.trim())),
        })),
      };
      return apiPost<{ campaign: { id: string } }>('/campaigns/brief', {
        name,
        ...(objective.trim() ? { objective } : {}),
        productBrief: product,
        buyerPersona,
        strategy,
      });
    },
    onSuccess: (res) => {
      toast({ title: 'Campaign created from brief', variant: 'success' });
      navigate(`/campaigns/${res.campaign.id}`);
    },
    onError: (e) => toast({ title: 'Could not create campaign', description: apiError(e), variant: 'destructive' }),
  });

  const productComplete = name.trim() && PRODUCT_FIELDS.every((f) => product[f.key].trim());
  const ctasComplete = ctas.every((c) => c.ctaType);
  const canContinue = step === 1 ? productComplete : step === 3 ? ctasComplete : true;

  return (
    <div>
      <PageHeader
        title="New campaign"
        description="Build a Campaign Brief — it drives every AI-generated email in the sequence."
        actions={<Button variant="ghost" onClick={() => navigate('/campaigns')}>Cancel</Button>}
      />

      <Card className="p-5">
        {/* Stepper */}
        <div className="mb-5 flex items-center justify-between">
          {STEPS.map((s, i) => {
            const state = step === s.id ? 'current' : step > s.id ? 'done' : 'todo';
            return (
              <div key={s.id} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold',
                      state === 'current' && 'border-primary bg-primary text-primary-foreground',
                      state === 'done' && 'border-primary bg-primary/10 text-primary',
                      state === 'todo' && 'border-input text-muted-foreground',
                    )}
                  >
                    {state === 'done' ? <Check className="h-4 w-4" /> : s.id}
                  </div>
                  <span className={cn('mt-1 text-xs', state === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('mx-2 h-0.5 flex-1', step > s.id ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            );
          })}
        </div>

        <div className="min-h-[40vh]">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Campaign name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 Demand Gen" />
                </div>
                <div className="space-y-1.5">
                  <Label>Objective</Label>
                  <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Book 10 demos" />
                </div>
              </div>
              {PRODUCT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label} *</Label>
                  <Textarea
                    value={product[f.key]}
                    onChange={(e) => setProduct({ ...product, [f.key]: e.target.value })}
                    placeholder={f.hint}
                    rows={f.key === 'productName' ? 1 : 2}
                  />
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Who you’re selling to. All optional — but the more you give, the sharper the AI’s tone and relevance.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Industry" value={persona.industry} onChange={(v) => setPersona({ ...persona, industry: v })} />
                <Field label="Company size (staff range)" value={persona.companySize} onChange={(v) => setPersona({ ...persona, companySize: v })} placeholder="50–200" />
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Economic buyer</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" value={persona.economicBuyerName} onChange={(v) => setPersona({ ...persona, economicBuyerName: v })} />
                  <Field label="Designation" value={persona.economicBuyerDesignation} onChange={(v) => setPersona({ ...persona, economicBuyerDesignation: v })} />
                  <div className="space-y-1.5">
                    <Label>Seniority</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={persona.economicBuyerSeniority}
                      onChange={(e) => setPersona({ ...persona, economicBuyerSeniority: e.target.value })}
                    >
                      <option value="">—</option>
                      {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <Field label="Email" type="email" value={persona.economicBuyerEmail} onChange={(v) => setPersona({ ...persona, economicBuyerEmail: v })} />
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Co-decision maker (optional)</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" value={persona.coDecisionMakerName} onChange={(v) => setPersona({ ...persona, coDecisionMakerName: v })} />
                  <Field label="Designation" value={persona.coDecisionMakerDesignation} onChange={(v) => setPersona({ ...persona, coDecisionMakerDesignation: v })} />
                  <Field label="Email" type="email" value={persona.coDecisionMakerEmail} onChange={(v) => setPersona({ ...persona, coDecisionMakerEmail: v })} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="space-y-1.5">
                  <Label>Total touchpoints</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    className="w-28"
                    value={total}
                    onChange={(e) => setTotalTouchpoints(Number(e.target.value))}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Auto-split <Badge variant="secondary">{trustCount} trust</Badge>{' '}
                  <Badge variant="secondary">{ctaCount} CTA</Badge> (80/20). CTAs land at the end.
                </div>
              </div>

              {/* Trust block preview (read-only) */}
              <div className="rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  Trust block — touches 1–{trustCount}
                </div>
                <ol className="divide-y text-sm">
                  {Array.from({ length: trustCount }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-6 text-center font-semibold">{i + 1}</span>
                      <Badge variant="muted">{trustTypeFor(i)}</Badge>
                      <span className="text-xs text-muted-foreground">ops-intel · no ask · vendor in signature only</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* CTA block — user configures each */}
              <div className="rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  CTA block — touches {trustCount + 1}–{total}
                </div>
                <div className="divide-y">
                  {ctas.map((c, i) => (
                    <div key={i} className="space-y-3 px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center font-semibold">{trustCount + i + 1}</span>
                        <select
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={c.ctaType}
                          onChange={(e) => setCta(i, { ctaType: e.target.value as CtaType, config: {} })}
                        >
                          <option value="">— Select CTA type —</option>
                          {(Object.keys(CTA_LABELS) as CtaType[]).map((t) => (
                            <option key={t} value={t}>{CTA_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                      {c.ctaType && (
                        <div className="grid gap-3 pl-9 sm:grid-cols-2">
                          {CTA_FIELDS[c.ctaType].map((f) => (
                            <div key={f.key} className="space-y-1.5">
                              <Label className="text-xs">{f.label}</Label>
                              <Input
                                type={f.type === 'datetime-local' ? 'datetime-local' : 'text'}
                                value={c.config[f.key] ?? ''}
                                placeholder={f.placeholder}
                                onChange={(e) => setCtaField(i, f.key, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {!ctasComplete && (
                <p className="text-xs text-destructive">Select a type for every CTA touch to continue.</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Summary label="Campaign">{name || '—'}{objective ? ` · ${objective}` : ''}</Summary>
              <Summary label="Product">{product.productName} — {product.productPurpose}</Summary>
              <Summary label="Positioning">{product.positioningStatement}</Summary>
              <Summary label="Buyer">
                {[persona.industry, persona.companySize, persona.economicBuyerSeniority, persona.economicBuyerDesignation]
                  .filter(Boolean).join(' · ') || 'Not specified'}
              </Summary>
              <div className="rounded-md border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Sequence</div>
                <div className="text-sm">{total} touches — {trustCount} trust + {ctaCount} CTA</div>
                <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {ctas.map((c, i) => (
                    <li key={i}>
                      Touch {trustCount + i + 1}: {c.ctaType ? CTA_LABELS[c.ctaType] : '—'}
                      {c.config.webinar_title ? ` · "${c.config.webinar_title}"` : ''}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">
                Creates the campaign as a draft with its sequence. Enroll contacts and activate from the campaign page;
                drafts are generated for review — nothing sends without approval.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={!canContinue}>
              Continue <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => create.mutate()} disabled={create.isPending || !productComplete || !ctasComplete}>
              <Rocket className="h-4 w-4" /> {create.isPending ? 'Creating…' : 'Create campaign'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
