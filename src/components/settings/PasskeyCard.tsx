'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, KeyRound, Trash2 } from 'lucide-react';
import {
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type PasskeyStatus = {
  enabled: boolean;
  registered_at?: number;
};

/**
 * Passkey enrollment / removal. Login-time use is wired via
 * `/api/auth/passkey-login` (separate route). Browser-side WebAuthn
 * complexity (challenge encoding, attestation parsing) is hidden by
 * @simplewebauthn/browser.
 *
 * Two states:
 *   not registered  → 「添加」 button → start ceremony → finish
 *   registered      → 「删除」 button + 注册时间 metadata
 */
export function PasskeyCard() {
  const t = useTranslations('settings.security.passkey');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [status, setStatus] = useState<PasskeyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  async function reload() {
    try {
      const r = await fetch('/api/newapi/api/user/passkey', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success) setStatus(j.data ?? { enabled: false });
    } catch {
      toast.error(t('loadFailed'));
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enroll() {
    if (!supported) {
      toast.error(t('unsupportedToast'));
      return;
    }
    setBusy(true);
    try {
      // Step 1: server starts the ceremony, returns PublicKeyCredentialCreationOptionsJSON
      const beginRes = await fetch('/api/newapi/api/user/passkey/register/begin', {
        method: 'POST',
      });
      const beginJson = await beginRes.json();
      if (!beginJson?.success) throw new Error(beginJson?.message || t('beginFailed'));

      // Step 2: browser does the actual ceremony with the security key /
      // platform authenticator. This is the part that requires an HTTPS
      // origin (or localhost) and a user gesture.
      const attestation = await startRegistration(beginJson.data);

      // Step 3: send the attestation back for verification + store.
      const finishRes = await fetch('/api/newapi/api/user/passkey/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      });
      const finishJson = await finishRes.json();
      if (!finishJson?.success) throw new Error(finishJson?.message || t('registerFailed'));

      toast.success(t('registered'));
      void reload();
    } catch (e) {
      // Cancelled / NotAllowed errors throw as DOMException with name
      // "NotAllowedError" — show a friendly message instead of leaking it.
      const msg =
        e instanceof Error && e.name === 'NotAllowedError'
          ? t('cancelled')
          : e instanceof Error
            ? e.message
            : t('registerFailed');
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t('deleteConfirmTitle'),
      description: t('deleteConfirm'),
      confirmLabel: t('delete'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/passkey', { method: 'DELETE' });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('deleteFailed'));
      toast.success(t('deleted'));
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span>{status?.enabled ? t('bound') : t('unbound')}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('description')}
        </p>
        {!supported && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            {t('browserUnsupported')}
          </p>
        )}
        <div className="flex gap-2">
          {status?.enabled ? (
            <Button variant="destructive" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4" /> {t('delete')}
            </Button>
          ) : (
            <Button onClick={enroll} disabled={busy || !supported}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('add')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
