'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ResetForm({
  initialEmail,
  initialToken,
}: {
  initialEmail?: string;
  initialToken?: string;
}) {
  const t = useTranslations('auth.reset');
  const tCommon = useTranslations('common');
  const hasToken = !!initialToken && !!initialEmail;
  const [email, setEmail] = useState(initialEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** When the reset succeeds, store the auto-generated password so we
   *  can show it once. We don't write it to localStorage — losing it on
   *  refresh is fine since the user just used it. */
  const [newPassword, setNewPassword] = useState<string | null>(null);

  // If we landed with token+email, auto-submit so the user just clicks
  // confirm rather than thinking about how to manually re-paste.
  useEffect(() => {
    if (hasToken && initialEmail) setEmail(initialEmail);
  }, [hasToken, initialEmail]);

  async function requestEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('request.failed'));
      setInfo(t('request.sentInfo'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('request.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: initialEmail, token: initialToken }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('confirm.failed'));
      // new-api returns the new password as `data` (a plain string).
      setNewPassword(typeof j.data === 'string' ? j.data : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('confirm.failed'));
    } finally {
      setBusy(false);
    }
  }

  // ─── Step 2 done — show the new password once ─────────────────────────
  if (newPassword) {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {t('confirm.successTitle')}
        </div>
        <div className="space-y-2">
          <Label>{t('confirm.newPasswordLabel')}</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-md border bg-muted px-3 py-2 font-mono text-base">
              {newPassword}
            </code>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(newPassword);
                toast.success(tCommon('copied'));
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('confirm.changeLater')}
          </p>
        </div>
        <Button asChild className="w-full">
          <a href="/auth/sign-in">{t('confirm.gotoSignIn')}</a>
        </Button>
      </div>
    );
  }

  // ─── Step 2 entry — token present, ask to confirm ────────────────────
  if (hasToken) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t.rich('confirm.aboutTo', {
            email: initialEmail ?? '',
            strong: (chunks) => (
              <span className="font-medium text-foreground">{chunks}</span>
            ),
          })}
        </p>
        {error && <p className="text-destructive">{error}</p>}
        <Button onClick={confirmReset} disabled={busy} className="w-full">
          {busy ? t('confirm.generating') : t('confirm.confirmReset')}
        </Button>
      </div>
    );
  }

  // ─── Step 1 — request email ──────────────────────────────────────────
  return (
    <form onSubmit={requestEmail} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="reset-email">{t('request.email')}</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-emerald-600">{info}</p>}
      <Button type="submit" disabled={busy || !email} className="w-full">
        {busy ? t('request.submitting') : t('request.submit')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t('request.rememberPrompt')}<a href="/auth/sign-in" className="underline">{t('request.directSignIn')}</a>
      </p>
    </form>
  );
}
