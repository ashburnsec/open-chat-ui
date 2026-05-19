'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeNextPath } from '@/lib/bff';

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const t = useTranslations('auth.signIn');
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when first /api/auth/login returns require_2fa — switches the
   *  form into OTP-prompt mode without leaving the page. */
  const [twoFAPending, setTwoFAPending] = useState(false);
  const [otp, setOtp] = useState('');

  // Defer the WebAuthn capability check to after mount: computing it
  // during render makes server (false) and first client render (true)
  // disagree, which produces a hydration mismatch on the passkey block.
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn());
  }, []);

  function gotoNext() {
    router.replace(safeNextPath(next) as never);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(fd.get('username') ?? '').trim(),
          password: String(fd.get('password') ?? ''),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || t('loginFailed'));
        return;
      }
      // 2FA challenge: new-api signals via `data.require_2fa = true`,
      // accompanied by a temporary session cookie that holds pending
      // auth state. We hand it off to /api/auth/login-2fa with the OTP.
      if (json.data?.require_2fa) {
        setTwoFAPending(true);
        return;
      }
      gotoNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || t('twoFA.verifyFailed'));
        return;
      }
      gotoNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setBusy(false);
    }
  }

  // Discoverable passkey login: no username needed — the browser shows
  // the user a list of credentials registered for this RP.
  async function loginWithPasskey() {
    if (!passkeySupported) {
      setError(t('passkey.unsupported'));
      return;
    }
    setError(null);
    setPasskeyBusy(true);
    try {
      const beginRes = await fetch('/api/auth/passkey-login/begin', { method: 'POST' });
      const beginJson = await beginRes.json();
      if (!beginJson?.success) {
        throw new Error(beginJson?.message || t('passkey.beginFailed'));
      }
      // new-api wraps the options under `data.options`.
      const options = beginJson.data?.options ?? beginJson.data;
      const assertion = await startAuthentication(options);

      const finishRes = await fetch('/api/auth/passkey-login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      });
      const finishJson = await finishRes.json();
      if (!finishRes.ok || !finishJson.success) {
        throw new Error(finishJson?.message || t('passkey.verifyFailed'));
      }
      gotoNext();
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? t('passkey.cancelled')
          : err instanceof Error
            ? err.message
            : t('passkey.failed');
      setError(msg);
    } finally {
      setPasskeyBusy(false);
    }
  }

  if (twoFAPending) {
    return (
      <form onSubmit={submitOtp} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="si-otp">{t('twoFA.title')}</Label>
          <Input
            id="si-otp"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={t('twoFA.placeholder')}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            {t('twoFA.hint')}
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || otp.length === 0} className="w-full">
          {busy ? t('twoFA.submitting') : t('twoFA.submit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setTwoFAPending(false);
            setOtp('');
            setError(null);
          }}
        >
          {t('twoFA.back')}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="si-username">{t('username')}</Label>
          <Input id="si-username" name="username" autoComplete="username" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="si-password">{t('password')}</Label>
          <Input id="si-password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('submitting') : t('submit')}
        </Button>
      </form>

      {passkeySupported && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-background px-2 text-muted-foreground">{t('passkey.or')}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={loginWithPasskey}
            disabled={passkeyBusy}
          >
            <KeyRound className="h-4 w-4" />
            {passkeyBusy ? t('passkey.submitting') : t('passkey.submit')}
          </Button>
        </>
      )}
    </div>
  );
}
