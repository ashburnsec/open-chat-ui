'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { useDynamicCatalog, visibleModels } from '@/lib/dynamic-catalog';

// Same constant as `lib/admin-models-types.ts`. Keeping the literal
// here (instead of importing) avoids dragging the admin-models module
// into the developer-hub bundle. Update both when the basis changes.
const PRICE_USD_PER_M_AT_1X = 2;

/**
 * Real shape of new-api `GET /api/pricing` (verified against the
 * running upstream). The `ModelPricing` type in newapi-client is
 * outdated — it predates new-api's per-channel pricing redesign.
 * Don't trust it; use this local type instead.
 */
type PricingRow = {
  model_name: string;
  vendor_id: number;
  /** 0 = per-token billing; 1 = per-call. */
  quota_type: number;
  /** Base input ratio. USD per M tokens = ratio × 2. */
  model_ratio: number;
  /** Per-call USD price (only when quota_type === 1). */
  model_price: number;
  /** Output / input ratio. Output USD/M = model_ratio × completion_ratio × 2. */
  completion_ratio: number;
  enable_groups?: string[];
  supported_endpoint_types?: string[];
};

/**
 * Read-only pricing table. Hits `/api/newapi/api/pricing` via the
 * generic BFF — same endpoint the upstream pricing page uses, no
 * envelope (response is `{ data: PricingRow[], auto_groups: [...] }`).
 *
 * Per-token rows show input/output USD/M. Per-call rows (quota_type=1)
 * show a single price in the "single call" column instead.
 */
export function ModelPricingTable() {
  const t = useTranslations('developer.models');
  const [pricing, setPricing] = useState<PricingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // M41 follow-up³: 真正的 "可见模型" 来源是 chat-portal dynamic catalog
  // (合并 newapi 模型 + chat-portal model_overrides.enabled). newapi 的
  // /api/user/models 不感知 model_overrides 表, 所以 admin 在内嵌
  // /admin/models 禁用一个模型, 它仍出现在 user/models 里. 用 catalog 才准.
  const catalog = useDynamicCatalog();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/newapi/api/pricing', { cache: 'no-store' });
        const j = await r.json();
        const list: PricingRow[] | undefined = j?.data;
        if (!Array.isArray(list)) throw new Error('no pricing payload');
        if (!cancelled) setPricing(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {t('loadFailed')}: {error}
      </div>
    );
  }
  if (pricing === null) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border bg-card/60 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }
  // M41 follow-up³: 用 dynamic-catalog visibleModels 过滤掉 admin 禁用的
  // 模型 (model_overrides.enabled=false). catalog 还没加载完时 (null) 显示
  // 全部 pricing, 加载完后才严格 filter. 避免初始空表闪烁.
  const visibleSet = catalog
    ? new Set(visibleModels(catalog).map((m) => m.id))
    : null;
  const effective = visibleSet
    ? pricing.filter((m) => visibleSet.has(m.model_name))
    : pricing;

  if (effective.length === 0) {
    return (
      <div className="rounded-md border bg-card/60 p-8 text-center text-sm text-muted-foreground">
        {t('empty')}
      </div>
    );
  }

  // Sort by vendor_id, then alphabetically by model name — keeps
  // related models grouped without a separate vendor section header.
  const sorted = [...effective].sort((a, b) => {
    if (a.vendor_id !== b.vendor_id) return a.vendor_id - b.vendor_id;
    return a.model_name.localeCompare(b.model_name);
  });

  const dash = t('perCallNone');

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="overflow-hidden rounded-md border bg-card/60 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">{t('col.model')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('col.input')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('col.output')}</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">
                {t('col.perCall')}
              </th>
              <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">
                {t('col.group')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const isPerCall = m.quota_type === 1 && m.model_price > 0;
              const inUsd = m.model_ratio * PRICE_USD_PER_M_AT_1X;
              const outUsd = m.model_ratio * m.completion_ratio * PRICE_USD_PER_M_AT_1X;
              const catEntry = catalog?.find((c) => c.id === m.model_name);
              return (
                <tr key={m.model_name} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <VendorMonogram model={m.model_name} size={20} iconOverride={catEntry?.icon} />
                      <span className="font-mono text-xs md:text-sm">{m.model_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {isPerCall || inUsd <= 0 ? dash : `$${inUsd.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {isPerCall || outUsd <= 0 ? dash : `$${outUsd.toFixed(2)}`}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right font-mono text-xs md:table-cell">
                    {isPerCall ? `$${m.model_price.toFixed(4)}` : dash}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                    {m.enable_groups?.join(', ') ?? dash}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
