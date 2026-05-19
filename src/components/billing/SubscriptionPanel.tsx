'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CreditCard, Loader2, Sparkles, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Plan = {
  id: number;
  // newapi 字段名（model/subscription.go）
  title: string;
  subtitle?: string;
  price_amount: number;
  currency: string;
  duration_unit?: string;
  duration_value?: number;
  total_amount?: number;
  enabled: boolean;
  sort_order?: number;
};

type Subscription = {
  id: number;
  plan_id: number;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
};

type SelfSub = {
  billing_preference: string;
  subscriptions: Subscription[];
  all_subscriptions: Subscription[];
};

const PREF_KEYS = ['wallet', 'subscriptionFirst', 'subscriptionOnly'] as const;
const PREF_API_KEYS: Record<(typeof PREF_KEYS)[number], string> = {
  wallet: 'wallet',
  subscriptionFirst: 'subscription_first',
  subscriptionOnly: 'subscription_only',
};

export function SubscriptionPanel({ quotaPerUnit }: { quotaPerUnit: number }) {
  const t = useTranslations('subscription');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [self, setSelf] = useState<SelfSub | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [p, s] = await Promise.all([
        fetch('/api/newapi/api/subscription/plans').then((r) => r.json()),
        fetch('/api/newapi/api/subscription/self').then((r) => r.json()),
      ]);
      // /api/subscription/plans returns either Plan[] directly or wrapped
      // as `[{plan: Plan}]` depending on new-api version — handle both.
      const items = Array.isArray(p?.data) ? p.data : (p?.data?.items ?? []);
      const flat: Plan[] = items.map((row: any) => (row?.plan ? row.plan : row));
      setPlans(flat.filter((pl) => pl.enabled));
      if (s?.success && s.data) setSelf(s.data);
    } catch {
      toast.error(t('loadFailed'));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function switchPreference(p: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/subscription/self/preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_preference: p }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('preference.switchFailed'));
      toast.success(t('preference.switched'));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('preference.switchFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(planId: number) {
    setBusy(true);
    try {
      // Try Stripe first; if disabled fall back to epay. The endpoints
      // share the same body shape so we can probe.
      for (const provider of ['stripe', 'creem', 'epay'] as const) {
        const r = await fetch(`/api/newapi/api/subscription/${provider}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: planId }),
        });
        const j = await r.json();
        if (j?.success) {
          const url = j.data?.redirect_url || j.data?.url;
          if (url) {
            window.location.href = url;
            return;
          }
          toast.success(t('plans.startedNoUrl'));
          return;
        }
        // Continue to next provider on "not enabled" errors.
      }
      toast.error(t('plans.noProvider'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('subscribeFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4" /> {t('preference.title')}
          </div>
          {self === null ? (
            <div className="text-sm text-muted-foreground">{t('loading')}</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {PREF_KEYS.map((k) => {
                const apiKey = PREF_API_KEYS[k];
                const cur = self.billing_preference === apiKey;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={busy || cur}
                    onClick={() => switchPreference(apiKey)}
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors',
                      cur ? 'border-ink bg-canvas-soft' : 'hover:bg-accent',
                    )}
                  >
                    <div className="text-sm font-medium">{t(`preference.${k}.label` as const)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{t(`preference.${k}.hint` as const)}</div>
                    {cur && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink">
                        <CheckCircle2 className="h-3 w-3" /> {t('preference.current')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {self?.subscriptions && self.subscriptions.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-2 text-sm font-medium">{t('current')}</div>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('list.planId')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('list.status')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('list.periodStart')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('list.periodEnd')}</th>
                </tr>
              </thead>
              <tbody>
                {self.subscriptions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">#{s.plan_id}</td>
                    <td className="px-4 py-2">{s.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {s.current_period_start
                        ? new Date(s.current_period_start * 1000).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {s.current_period_end
                        ? new Date(s.current_period_end * 1000).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4" /> {t('plans.title')}
          </div>
          {plans === null ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('plans.empty')}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <Card key={p.id} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <div className="text-base font-semibold">{p.title}</div>
                    {p.subtitle && (
                      <p className="line-clamp-3 text-xs text-muted-foreground">{p.subtitle}</p>
                    )}
                    <div className="text-2xl font-semibold tabular-nums">
                      {p.currency === 'USD' ? '$' : ''}
                      {p.price_amount.toFixed(2)}
                      {p.currency !== 'USD' && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {p.currency}
                        </span>
                      )}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        / {p.duration_unit ?? t('intervalMonth')}
                      </span>
                    </div>
                    {p.total_amount ? (
                      <div className="text-xs text-muted-foreground">
                        {t('plans.perPeriodQuota', {
                          amount: (p.total_amount / quotaPerUnit).toFixed(2),
                        })}
                      </div>
                    ) : null}
                    <Button
                      onClick={() => void subscribe(p.id)}
                      disabled={busy}
                      className="mt-auto w-full"
                    >
                      <CreditCard className="h-4 w-4" /> {t('plans.subscribe')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
