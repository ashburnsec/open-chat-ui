'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeNextPath } from '@/lib/bff';

export function SignUpForm({
  next,
  affCode,
  emailVerificationRequired,
}: {
  next?: string;
  /** Optional inviter aff code from ?aff= URL param. Forwarded to new-api
   *  so the inviter gets credited per their bonus rules. */
  affCode?: string;
  emailVerificationRequired: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('auth.signUp');
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  async function sendCode() {
    if (!email) {
      setError(t('fillEmailFirst'));
      return;
    }
    setError(null);
    setInfo(null);
    setSendingCode(true);
    try {
      const r = await fetch(
        `/api/auth/verification?email=${encodeURIComponent(email)}&type=register`,
      );
      const json = await r.json();
      if (!json.success) setError(json.message || t('codeSendFailed'));
      else setInfo(t('codeSent'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    if (password !== confirm) {
      setError(t('passwordMismatch'));
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(fd.get('username') ?? '').trim(),
          password,
          email: email || undefined,
          verification_code: String(fd.get('verification_code') ?? '') || undefined,
          aff_code: affCode || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || t('registerFailed'));
        return;
      }
      // After registration, log in so the session is established.
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(fd.get('username') ?? '').trim(),
          password,
        }),
      });
      const loginJson = await loginRes.json();
      if (!loginRes.ok || !loginJson.success) {
        setError(loginJson.message || t('loginFailed'));
        return;
      }
      router.replace(safeNextPath(next) as never);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="su-username">{t('username')}</Label>
        <Input id="su-username" name="username" autoComplete="username" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-email">{emailVerificationRequired ? t('email') : t('emailOptional')}</Label>
        <div className="flex gap-2">
          <Input
            id="su-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={emailVerificationRequired}
            autoComplete="email"
          />
          {emailVerificationRequired && (
            <Button type="button" variant="outline" onClick={sendCode} disabled={sendingCode}>
              {sendingCode ? t('sendingCode') : t('sendCode')}
            </Button>
          )}
        </div>
      </div>
      {emailVerificationRequired && (
        <div className="space-y-1.5">
          <Label htmlFor="su-code">{t('verificationCode')}</Label>
          <Input id="su-code" name="verification_code" required />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="su-password">{t('password')}</Label>
        <Input id="su-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-confirm">{t('confirmPassword')}</Label>
        <Input id="su-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-emerald-600">{info}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
