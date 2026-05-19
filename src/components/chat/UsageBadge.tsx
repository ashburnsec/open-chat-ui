'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import {
  getCostUsd,
  getPricingVersion,
  subscribePricing,
} from '@/lib/pricing-cache';
import type { UsageInfo } from '@/hooks/use-chat-stream';

/**
 * Tiny pill rendered at the bottom of every assistant bubble (M24).
 * Width-responsive: detailed on desktop, compact on mobile.
 *
 * Subscribes to pricing-cache version so it re-renders the moment the
 * catalog finishes loading — important because pricing fetch happens
 * in parallel with the first SSE turn, and the model lookup may miss
 * for a few hundred ms after a fresh page load.
 */
export function UsageBadge({ usage }: { usage: UsageInfo }) {
  const t = useTranslations('chat.usageBadge');
  // Re-render whenever the pricing cache repopulates.
  useSyncExternalStore(subscribePricing, getPricingVersion, () => 0);

  const total = usage.promptTokens + usage.completionTokens;
  const cost = getCostUsd(usage.model, usage.promptTokens, usage.completionTokens);

  const aria =
    cost !== null
      ? t('ariaWithCost', { cost: fmtUsd(cost), tokens: total, model: usage.model })
      : t('ariaTokensOnly', { tokens: total, model: usage.model });

  return (
    <span
      aria-label={aria}
      className="inline-flex select-none items-center gap-1.5 rounded-full bg-muted/40 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground"
    >
      {/* desktop: in / out split */}
      <span className="hidden sm:inline">
        {usage.promptTokens.toLocaleString()} {t('in')} · {usage.completionTokens.toLocaleString()} {t('out')}
      </span>
      {/* mobile: total only, abbreviated */}
      <span className="sm:hidden">
        {fmtTokens(total)} {t('tok')}
      </span>
      {usage.model && (
        <span className="hidden opacity-60 md:inline">· {usage.model}</span>
      )}
      {cost !== null && (
        <span className="font-semibold text-foreground/80">· {fmtUsd(cost)}</span>
      )}
    </span>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Tiny costs need more decimals so users actually see a number;
 *  larger ones round to 4. Never strip trailing zeros — fixed width
 *  helps badges line up across consecutive bubbles. */
function fmtUsd(n: number): string {
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(6)}`;
}
