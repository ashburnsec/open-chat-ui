'use client';

import { useTranslations } from 'next-intl';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TOPUP_PRESETS,
  type TopupPreset,
} from '@/lib/topup-presets';

/**
 * Anchor-row of 4 large preset cards on /purchase. The selected card
 * lifts the amount up to PurchasePanel, which feeds it into
 * OnlineTopupCard. Custom-typed amounts deselect all cards (handled
 * by `presetIdForAmount` in the parent).
 */
export function PurchasePresetCards({
  selectedId,
  onSelect,
}: {
  selectedId: TopupPreset['id'] | null;
  onSelect: (preset: TopupPreset) => void;
}) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {TOPUP_PRESETS.map((p) => {
        const active = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            aria-pressed={active}
            className={cn(
              'group relative flex flex-col items-start gap-1.5 rounded-md border p-4 text-left transition-colors duration-150',
              active
                ? 'border-ink bg-accent ring-2 ring-ink/30'
                : 'border-border bg-card hover:border-ink',
            )}
          >
            {p.recommended && (
              <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                <Sparkles className="h-3 w-3" />
                {t('purchase.presets.recommended')}
              </span>
            )}
            <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {t(p.labelKey)}
            </div>
            <div className="font-display text-2xl font-semibold tabular-nums">
              ${p.amount}
            </div>
            <div className="text-xs leading-snug text-muted-foreground">
              {t(p.hintKey)}
            </div>
            {active && (
              <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
