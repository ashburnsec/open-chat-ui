'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasskeyCard } from '@/components/settings/PasskeyCard';
import { useConfirm } from '@/hooks/use-confirm';

type TwoFAStatus = { enabled: boolean; requires_backup_codes?: boolean };

/**
 * Security tab — manage 2FA. Three visual states:
 *
 *   1. Disabled       Show "启用" button. Click → calls /setup, gets back
 *                     a secret + qr_code_data (otpauth://...) + backup codes.
 *   2. Setting up     Render QR + secret + backup codes. Ask user to scan
 *                     and enter a 6-digit code from authenticator. POST
 *                     /enable to confirm.
 *   3. Enabled        Show "已启用 + 重置 backup codes + 关闭".
 */
export function SecurityTab() {
  const t = useTranslations('settings.security.twoFA');
  const tCommon = useTranslations('common');
  // Aliased to avoid colliding with the local `confirm()` function below
  // (which is the 2FA enable submit handler, not a dialog).
  const confirmDialog = useConfirm();
  const [status, setStatus] = useState<TwoFAStatus | null>(null);
  const [setup, setSetup] = useState<{
    qr: string;
    secret: string;
    backup: string[];
  } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const r = await fetch('/api/newapi/api/user/2fa/status', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success) setStatus(j.data);
    } catch {
      toast.error(t('loadFailed'));
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/2fa/setup', { method: 'POST' });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('setupFailed'));
      setSetup({
        qr: String(j.data?.qr_code_data ?? ''),
        secret: String(j.data?.secret ?? ''),
        backup: Array.isArray(j.data?.backup_codes) ? j.data.backup_codes : [],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('setupFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(code)) {
      toast.error(t('codePrompt'));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('enableFailed'));
      toast.success(t('enabledToast'));
      setSetup(null);
      setCode('');
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('enableFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const ok = await confirmDialog({
      title: t('disableConfirmTitle'),
      description: t('disableConfirm'),
      confirmLabel: t('disable'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/2fa/disable', { method: 'POST' });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('disableFailed'));
      toast.success(t('disabledToast'));
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('disableFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function regenBackup() {
    const ok = await confirmDialog({
      title: t('regenerateConfirmTitle'),
      description: t('regenerateConfirm'),
      confirmLabel: t('regenerateBackup'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/2fa/backup_codes', { method: 'POST' });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('regenerateFailed'));
      const codes: string[] = Array.isArray(j.data?.backup_codes)
        ? j.data.backup_codes
        : [];
      toast.success(t('regenerated'));
      setSetup({ qr: '', secret: '', backup: codes });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('regenerateFailed'));
    } finally {
      setBusy(false);
    }
  }

  // ─── Setting-up state — render QR + verify form ──────────────────────
  if (setup) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4">
          {setup.qr && (
            <>
              <div>
                <h3 className="text-sm font-medium">{t('scanQrTitle')}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('scanQrHint')}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-md bg-white p-3">
                  <QRCodeSVG value={setup.qr} size={180} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('manualSecret')}
                  <code className="ml-1 select-all rounded bg-muted px-1 font-mono">
                    {setup.secret}
                  </code>
                </div>
              </div>
            </>
          )}

          {setup.backup.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">{t('backupCodes')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('backupHintLong')}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-sm">
                {setup.backup.map((c) => (
                  <code key={c} className="rounded bg-muted px-2 py-1 text-center select-all">
                    {c}
                  </code>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(setup.backup.join('\n'));
                  toast.success(t('backupCopied'));
                }}
              >
                <Copy className="h-3.5 w-3.5" /> {t('copyAll')}
              </Button>
            </div>
          )}

          {setup.qr && (
            <>
              <div className="space-y-1.5">
                <Label>{t('codeLabel')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                  />
                  <Button onClick={confirm} disabled={busy || code.length !== 6}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('verify')}
                  </Button>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                {tCommon('cancel')}
              </Button>
            </>
          )}

          {!setup.qr && (
            <Button onClick={() => setSetup(null)}>{t('gotIt')}</Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ─── Disabled or Enabled normal states ───────────────────────────────
  if (status === null) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {tCommon('loading')}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          {status.enabled ? (
            <>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>{t('statusEnabled')}</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span>{t('statusDisabled')}</span>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('descriptionLong')}
        </p>
        <div className="flex gap-2">
          {status.enabled ? (
            <>
              <Button variant="outline" onClick={regenBackup} disabled={busy}>
                {t('regenerateBackup')}
              </Button>
              <Button variant="destructive" onClick={disable} disabled={busy}>
                {t('disable')}
              </Button>
            </>
          ) : (
            <Button onClick={start} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('enable')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    <PasskeyCard />
    </div>
  );
}

