'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CheckinStatus = {
  enabled: boolean;
  min_quota: number;
  max_quota: number;
  stats?: {
    /** newapi GetUserCheckinStats 返回的实际字段名是 checked_in_today
     *  (不是 checked_in_today, 上次写错导致按钮永远显示「今日签到」). */
    checked_in_today?: boolean;
    total_checkins?: number;
    checkin_count?: number;
    total_quota?: number;
  };
};

/**
 * Daily check-in button. Calls newapi GET /api/user/checkin on mount
 * to read enabled flag + checked_in_today, then POSTs the same path on
 * click. Hides itself when newapi has the feature disabled (status.enabled = false).
 *
 * Quotas are returned in newapi's internal "quota" unit (1 USD ≈ 500_000
 * by default); we surface the raw delta and let the BalancePill refresh
 * pick up the new wallet total via its own polling.
 */
export function CheckinButton({ quotaPerUnit }: { quotaPerUnit: number }) {
  const t = useTranslations('checkin');
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const r = await fetch('/api/newapi/api/user/checkin');
      const j = await r.json();
      if (j?.success && j.data) setStatus(j.data);
      else setStatus({ enabled: false, min_quota: 0, max_quota: 0 });
    } catch {
      setStatus({ enabled: false, min_quota: 0, max_quota: 0 });
    }
  }

  async function doCheckin() {
    setLoading(true);
    try {
      const r = await fetch('/api/newapi/api/user/checkin', { method: 'POST' });
      const j = await r.json();
      if (!j?.success) {
        toast.error(j?.message || t('failed'));
        return;
      }
      const awarded = j.data?.quota_awarded ?? 0;
      const usd = awarded / quotaPerUnit;
      toast.success(t('success', { amount: usd.toFixed(3) }));
      // Optimistic: mark today as checked locally; next reload will refresh
      setStatus((s) =>
        s ? { ...s, stats: { ...s.stats, checked_in_today: true } } : s,
      );
      // Notify BalancePill etc. to refetch the wallet total
      window.dispatchEvent(new CustomEvent('cp:wallet-changed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('failed'));
    } finally {
      setLoading(false);
    }
  }

  if (!status?.enabled) return null;
  const checked = !!status.stats?.checked_in_today;
  const minUsd = (status.min_quota / quotaPerUnit).toFixed(3);
  const maxUsd = (status.max_quota / quotaPerUnit).toFixed(3);

  return (
    <Button
      size="pill"
      variant="ghost"
      onClick={doCheckin}
      disabled={loading || checked}
      title={
        checked
          ? t('alreadyToday')
          : t('hint', { min: minUsd, max: maxUsd })
      }
      className={cn(
        'hidden sm:inline-flex',
        checked
          ? 'text-muted-foreground'
          : 'border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10',
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Calendar className="h-4 w-4" />
      )}
      <span>{checked ? t('alreadyToday') : t('label')}</span>
    </Button>
  );
}
