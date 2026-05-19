'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WalletMinimal } from 'lucide-react';
import type { SelfUser } from '@/lib/newapi-client';

/**
 * Balance display + auto-refresh.
 *
 * new-api stores quota as raw integer "units"; the system option
 * `quota_per_unit` (default 500,000) defines how many units per USD.
 *  USD = quota / quota_per_unit.
 *
 * Auto-polls /api/user/self every 30s while the tab is visible. Pauses
 * when the tab is hidden so we don't burn requests in background tabs.
 */
export function BalancePill({
  initialUser,
  quotaPerUnit,
  pollIntervalMs = 30_000,
}: {
  initialUser: SelfUser;
  quotaPerUnit: number;
  pollIntervalMs?: number;
}) {
  const t = useTranslations('nav');
  const [quota, setQuota] = useState<number>(initialUser.quota);
  const prevQuota = useRef<number>(initialUser.quota);
  const [flipKey, setFlipKey] = useState(0);

  useEffect(() => {
    if (quota !== prevQuota.current) {
      prevQuota.current = quota;
      setFlipKey((k) => k + 1);
    }
  }, [quota]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      // Don't bother polling when tab is hidden — refreshes when it
      // becomes visible again via the visibilitychange listener below.
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const r = await fetch('/api/newapi/api/user/self', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && j?.success && typeof j.data?.quota === 'number') {
          setQuota(j.data.quota);
        }
      } catch {
        /* network blip — try again next tick */
      }
    }

    timer = setInterval(refresh, pollIntervalMs);
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pollIntervalMs]);

  const usd = quota / Math.max(quotaPerUnit, 1);
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm transition-shadow hover:shadow-[var(--shadow-soft)]"
      title={t('balanceTooltip', {
        quota: quota.toLocaleString(),
        perUnit: quotaPerUnit.toLocaleString(),
      })}
    >
      <WalletMinimal className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      <span
        key={flipKey}
        className="font-medium tabular-nums [animation:number-flip_0.45s_ease-out]"
      >
        {formatUsd(usd)}
      </span>
    </div>
  );
}

/**
 * USD formatting:
 *   ≥ $1       → 2 decimals, e.g. "$199.27"
 *   < $1       → 4 decimals so micro-balances are visible, e.g. "$0.1234"
 *   < $0.0001  → "$<0.0001" so we never lie with "$0.0000"
 */
function formatUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.0001) return `$${amount.toFixed(4)}`;
  if (amount > 0) return `$<0.0001`;
  return '$0.00';
}
