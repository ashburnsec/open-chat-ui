'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Loader2, ArrowRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import type { SelfUser } from '@/lib/newapi-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Invite tab — show the user's affiliate code, share link, QR, and a
 * stat strip with rewards earned. Lets them transfer accumulated aff
 * quota into their main wallet.
 */
export function InviteTab({
  user,
  quotaPerUnit,
}: {
  user: SelfUser;
  quotaPerUnit: number;
}) {
  const t = useTranslations('settings.invite');
  // aff_code may be empty until first time anyone calls GET /api/user/aff,
  // which lazily creates one. Surface that with a "create my code" button
  // rather than a confusing blank.
  const [code, setCode] = useState<string>(user.aff_code ?? '');
  const [stats, setStats] = useState<{
    affQuota: number;
    affHistoryQuota: number;
    affCount: number;
  }>({
    affQuota: user.aff_quota,
    affHistoryQuota: user.aff_history_quota,
    affCount: user.aff_count,
  });
  const [busy, setBusy] = useState(false);

  // If we haven't got a code yet (admin-created accounts often don't),
  // call /api/user/aff which generates one on the fly.
  useEffect(() => {
    if (code) return;
    void (async () => {
      try {
        const r = await fetch('/api/newapi/api/user/aff', { cache: 'no-store' });
        const j = await r.json();
        if (j?.success && typeof j.data === 'string') setCode(j.data);
      } catch {
        /* leave blank — user can refresh */
      }
    })();
  }, [code]);

  async function refreshStats() {
    try {
      const r = await fetch('/api/newapi/api/user/self', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success && j.data) {
        setStats({
          affQuota: j.data.aff_quota,
          affHistoryQuota: j.data.aff_history_quota,
          affCount: j.data.aff_count,
        });
      }
    } catch {
      /* not fatal */
    }
  }

  async function transfer() {
    if (stats.affQuota <= 0) return;
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/aff_transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quota: stats.affQuota }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('transferFailed'));
      toast.success(
        t('transferred', { amount: `$${(stats.affQuota / quotaPerUnit).toFixed(4)}` }),
      );
      await refreshStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('transferFailed'));
    } finally {
      setBusy(false);
    }
  }

  // Build the share URL on the client so server-side it stays empty
  // (avoids hardcoding origin into RSC).
  const [shareUrl, setShareUrl] = useState('');
  useEffect(() => {
    if (!code) return;
    setShareUrl(`${window.location.origin}/auth/sign-up?aff=${encodeURIComponent(code)}`);
  }, [code]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-medium">{t('title')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('description')}
            </p>
          </div>

          {!code ? (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> {t('loadingCode')}
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>{t('code')}</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all rounded-md border bg-muted px-3 py-2 font-mono text-base">
                    {code}
                  </code>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(code);
                      toast.success(t('codeCopied'));
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {shareUrl && (
                <div className="space-y-1.5">
                  <Label>{t('shareLink')}</Label>
                  <div className="flex items-center gap-2">
                    <Input value={shareUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(shareUrl);
                        toast.success(t('linkCopied'));
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {shareUrl && (
                <div className="flex items-start gap-4">
                  <div className="rounded-md bg-white p-2">
                    <QRCodeSVG value={shareUrl} size={120} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('qrHint')}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-medium">{t('stats.title')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('stats.description')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t('stats.count')} value={String(stats.affCount)} />
            <Stat
              label={t('stats.history')}
              value={`$${(stats.affHistoryQuota / quotaPerUnit).toFixed(4)}`}
            />
            <Stat
              label={t('stats.available')}
              value={`$${(stats.affQuota / quotaPerUnit).toFixed(4)}`}
              highlight={stats.affQuota > 0}
            />
          </div>
          <Button
            onClick={transfer}
            disabled={busy || stats.affQuota <= 0}
            className="w-full sm:w-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                {t('transfer')} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          'mt-0.5 text-lg font-semibold tabular-nums ' +
          (highlight ? 'text-primary' : '')
        }
      >
        {value}
      </div>
    </div>
  );
}
