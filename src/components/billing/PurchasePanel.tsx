'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CreditCard, Gift, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { presetIdForAmount } from '@/lib/topup-presets';
import { PurchasePresetCards } from './PurchasePresetCards';

type TopupInfo = {
  enable_online_topup: boolean;
  enable_stripe_topup: boolean;
  enable_creem_topup: boolean;
  enable_waffo_topup: boolean;
  enable_waffo_pancake_topup: boolean;
  amount_options?: number[];
  min_topup: number;
  stripe_min_topup: number;
  waffo_min_topup: number;
  pay_methods?: Array<{ name: string; type: string; min_topup?: number | string }>;
  waffo_pay_methods?: Array<{ name: string; type: string }> | null;
  creem_products?: string;
};

type Order = {
  id: number;
  user_id: number;
  amount: number;
  money: number;
  trade_no: string;
  payment_method: string;
  payment_provider: string;
  create_time: number;
  complete_time: number;
  status: 'pending' | 'completed' | 'failed' | string;
};

/**
 * /purchase page. Three sections:
 *   - Current balance (refreshed on demand after a successful redeem)
 *   - Redemption code (always available — works even without configured providers)
 *   - Online top-up (only the providers admin has enabled show; the rest
 *     are hidden so users don't see broken buttons)
 *   - Recent orders table
 */
export function PurchasePanel({ quotaPerUnit }: { quotaPerUnit: number }) {
  const t = useTranslations('purchase');
  const [info, setInfo] = useState<TopupInfo | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // M25: lifted from OnlineTopupCard so the marketing preset cards
  // can drive it. Default to the "recommended" tier ($50) — also the
  // amount the preset row highlights at first paint.
  const [amount, setAmount] = useState<number>(50);

  async function load() {
    try {
      const [i, o, u] = await Promise.all([
        fetch('/api/newapi/api/user/topup/info').then((r) => r.json()),
        fetch('/api/newapi/api/user/topup/self?p=0&size=10').then((r) => r.json()),
        fetch('/api/newapi/api/user/self').then((r) => r.json()),
      ]);
      if (i?.success) setInfo(i.data);
      const items = Array.isArray(o?.data) ? o.data : (o?.data?.items ?? []);
      setOrders(items as Order[]);
      if (u?.success && u.data) setBalance(u.data.quota);
    } catch {
      toast.error(t('loadFailed'));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-canvas-soft p-2.5"><Wallet className="h-5 w-5 text-ink" /></div>
          <div>
            <div className="text-xs text-muted-foreground">{t('balanceTitle')}</div>
            <div className="text-2xl font-semibold tabular-nums">
              {balance !== null ? `$${(balance / quotaPerUnit).toFixed(4)}` : '—'}
            </div>
          </div>
        </CardContent>
      </Card>

      <PurchasePresetCards
        selectedId={presetIdForAmount(amount)}
        onSelect={(p) => setAmount(p.amount)}
      />

      <RedeemCard onRedeemed={() => void load()} disabled={busy} setBusy={setBusy} />

      <OnlineTopupCard
        info={info}
        disabled={busy}
        setBusy={setBusy}
        amount={amount}
        onAmountChange={setAmount}
      />

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2 text-sm font-medium">{t('history.title')}</div>
          {orders === null ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('history.loading')}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              {t('history.empty')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('history.createdAt')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('history.orderNo')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('history.channel')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('history.money')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('history.quotaTopup')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('history.status')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(o.create_time * 1000).toLocaleString(undefined, { hour12: false })}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{o.trade_no.slice(0, 16)}…</td>
                    <td className="px-4 py-2">{o.payment_provider || o.payment_method}</td>
                    <td className="px-4 py-2 text-right tabular-nums">${o.money?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      ${(o.amount / quotaPerUnit).toFixed(4)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs',
                          o.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : o.status === 'failed'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-amber-500/10 text-amber-700',
                        )}
                      >
                        {o.status === 'completed'
                          ? t('history.statusCompleted')
                          : o.status === 'failed'
                            ? t('history.statusFailed')
                            : t('history.statusProcessing')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RedeemCard({
  onRedeemed,
  disabled,
  setBusy,
}: {
  onRedeemed: () => void;
  disabled: boolean;
  setBusy: (b: boolean) => void;
}) {
  const t = useTranslations('purchase.redeem');
  const [code, setCode] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || disabled) return;
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: code.trim() }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('failed'));
      toast.success(t('success'));
      setCode('');
      onRedeemed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Gift className="h-4 w-4" /> {t('title')}
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('placeholder')}
            disabled={disabled}
            className="font-mono"
          />
          <Button type="submit" disabled={disabled || !code.trim()}>{t('submit')}</Button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('hint')}
        </p>
      </CardContent>
    </Card>
  );
}

function OnlineTopupCard({
  info,
  disabled,
  setBusy,
  amount,
  onAmountChange,
}: {
  info: TopupInfo | null;
  disabled: boolean;
  setBusy: (b: boolean) => void;
  /** M25: amount + setter are lifted to PurchasePanel so the preset
   *  cards above can drive them. The shortcut buttons inside this
   *  card still work as before — they just write through the
   *  callback now instead of a local useState. */
  amount: number;
  onAmountChange: (n: number) => void;
}) {
  const t = useTranslations('purchase.online');
  const [provider, setProvider] = useState<'epay' | 'stripe' | 'creem' | 'waffo' | null>(null);

  // Compute the first available provider after info loads.
  useEffect(() => {
    if (!info || provider) return;
    if (info.enable_online_topup) setProvider('epay');
    else if (info.enable_stripe_topup) setProvider('stripe');
    else if (info.enable_creem_topup) setProvider('creem');
    else if (info.enable_waffo_topup) setProvider('waffo');
  }, [info, provider]);

  if (!info) {
    return (
      <Card>
        <CardContent className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
        </CardContent>
      </Card>
    );
  }

  const anyEnabled =
    info.enable_online_topup ||
    info.enable_stripe_topup ||
    info.enable_creem_topup ||
    info.enable_waffo_topup;

  if (!anyEnabled) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4" /> {t('title')}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('disabled')}
          </p>
        </CardContent>
      </Card>
    );
  }

  async function pay() {
    if (!provider) return;
    setBusy(true);
    try {
      let path: string;
      let body: Record<string, unknown>;
      if (provider === 'epay') {
        path = '/api/newapi/api/user/pay';
        body = { amount, payment_method: info!.pay_methods?.[0]?.type ?? 'alipay' };
      } else if (provider === 'stripe') {
        path = '/api/newapi/api/user/stripe/pay';
        body = { amount };
      } else if (provider === 'creem') {
        path = '/api/newapi/api/user/creem/pay';
        body = { amount };
      } else {
        path = '/api/newapi/api/user/waffo/pay';
        body = { amount, pay_method: info!.waffo_pay_methods?.[0]?.type ?? '' };
      }
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('startFailed'));
      const redirect = j.data?.redirect_url || j.data?.url || j.url;
      if (redirect) {
        window.location.href = redirect;
      } else if (j.data?.client_secret) {
        toast.message(t('stripeNotIntegrated'), { duration: 5000 });
      } else {
        toast.success(t('startedSuccess'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('startFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4" /> {t('title')}
        </div>

        {/* Provider tabs — only render the enabled ones. */}
        <div className="flex flex-wrap gap-1">
          {info.enable_online_topup && (
            <ProviderTab name={t('providerEpay')} active={provider === 'epay'} onClick={() => setProvider('epay')} />
          )}
          {info.enable_stripe_topup && (
            <ProviderTab name="Stripe" active={provider === 'stripe'} onClick={() => setProvider('stripe')} />
          )}
          {info.enable_creem_topup && (
            <ProviderTab name="Creem" active={provider === 'creem'} onClick={() => setProvider('creem')} />
          )}
          {info.enable_waffo_topup && (
            <ProviderTab name="Waffo" active={provider === 'waffo'} onClick={() => setProvider('waffo')} />
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">{t('amountLabel')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(info.amount_options ?? [10, 20, 50, 100]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onAmountChange(opt)}
                className={cn(
                  'rounded-md border px-3 py-1 text-sm transition-colors',
                  amount === opt
                    ? 'border-ink bg-canvas-soft text-ink'
                    : 'hover:bg-accent',
                )}
              >
                ${opt}
              </button>
            ))}
            <Input
              type="number"
              min={info.min_topup}
              value={amount}
              onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
              className="w-28"
            />
          </div>
        </div>

        <Button
          onClick={pay}
          disabled={disabled || !provider || amount < (info.min_topup ?? 1)}
          className="w-full sm:w-auto"
        >
          <CheckCircle2 className="h-4 w-4" /> {t('submit', { amount })}
        </Button>

        <p className="text-[11px] text-muted-foreground">
          {t('hint')}
        </p>
      </CardContent>
    </Card>
  );
}

function ProviderTab({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-ink bg-canvas-soft text-ink' : 'hover:bg-accent',
      )}
    >
      {name}
    </button>
  );
}
