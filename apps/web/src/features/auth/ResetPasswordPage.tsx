import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { apiGet, apiPost, apiError } from '@/lib/api';
import { useAuth, type AuthUser } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Public: set a password via a token (from the provisioning / forgot-password
// link), then auto-login and land on the dashboard.
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [state, setState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) { setState('invalid'); return; }
    apiGet<{ valid: boolean; email?: string }>(`/auth/reset/${token}`)
      .then((r) => { if (active) { setState(r.valid ? 'valid' : 'invalid'); setEmail(r.email ?? null); } })
      .catch(() => { if (active) setState('invalid'); });
    return () => { active = false; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const result = await apiPost<{ user: AuthUser; accessToken: string; refreshToken: string }>(
        '/auth/reset', { token, password },
      );
      setSession(result); // auto-login
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Megaphone className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Set your password</CardTitle>
          <CardDescription>
            {state === 'valid' && email ? `for ${email}` : 'B2B Outreach Platform'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === 'checking' && <p className="text-sm text-muted-foreground">Checking your link…</p>}
          {state === 'invalid' && (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">This link is invalid or has expired.</p>
              <Link to="/login" className="text-primary underline">Back to sign in</Link>
            </div>
          )}
          {state === 'valid' && (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm password</Label>
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Setting password…' : 'Set password & continue'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
