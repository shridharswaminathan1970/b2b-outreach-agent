import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, CheckCircle2 } from 'lucide-react';
import { apiPost, apiError } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Public evaluation/signup request. Submitting notifies the platform owner, who
// approves it; the requester then gets a set-password link by email.
export function SignupPage() {
  const [form, setForm] = useState({
    companyName: '', fullName: '', email: '', contactNumber: '',
    addressLine1: '', addressLine2: '', city: '', zip: '', country: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('Your name and email are required.');
      return;
    }
    setSubmitting(true);
    try {
      // Only send non-empty fields.
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
      await apiPost('/provisioning/signup-requests', payload);
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <CardTitle>Request submitted</CardTitle>
            <CardDescription>
              Thanks! Your request is being reviewed. You’ll receive an email with a link to set your
              password and access the app once it’s approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login" className="text-sm text-primary underline">Back to sign in</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg my-8">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Megaphone className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Request access</CardTitle>
          <CardDescription>Tell us about you — we’ll set up your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name *</Label>
                <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input value={form.companyName} placeholder="(defaults to your name)" onChange={(e) => set('companyName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact number</Label>
                <Input value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address line 1</Label>
                <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address line 2</Label>
                <Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Zip / Postal code</Label>
                <Input value={form.zip} onChange={(e) => set('zip', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Country</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                >
                  <option value="">— Select a country —</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit request'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already have an account? <Link to="/login" className="text-primary underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
