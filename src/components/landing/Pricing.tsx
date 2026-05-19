'use client';

import { useTranslations } from 'next-intl';
import { Check, Sparkles } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { useReveal } from './use-reveal';
import { SectionHeader } from './Features';
import { TOPUP_PRESETS } from '@/lib/topup-presets';

/**
 * Single-tier "pay-as-you-go" pricing — chat-portal proxies new-api's
 * per-token billing, so there's no monthly subscription. Per-model
 * unit price table is i18n'd; numbers come from the M3.2-B price
 * config (USD-equivalent, displayed as $/1M tokens).
 */

type Row = { model: string; input: string; output: string };
const TABLE: Row[] = [
  { model: 'GPT-5.4', input: '$2.50', output: '$10.00' },
  { model: 'GPT-5.4-mini', input: '$0.25', output: '$1.00' },
  { model: 'GPT-5.5', input: '$1.25', output: '$5.00' },
  { model: 'DeepSeek-V3.1', input: '$0.55', output: '$2.20' },
  { model: 'Kimi-K2.5', input: '$0.60', output: '$2.50' },
  { model: 'Grok-4 (fast)', input: '$0.20', output: '$1.50' },
  { model: 'gpt-image-2 (low)', input: '~$0.05 / image', output: '' },
];

export function Pricing() {
  const t = useTranslations('landing.pricing');
  const tt = useTranslations();
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <SectionHeader title={t('title')} subtitle={t('subtitle')} />

        {/* M25: tier overview anchors. Same constants as the
         *  /purchase preset cards, so SEO-acquired visitors see the
         *  same ladder before they sign up. */}
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TOPUP_PRESETS.map((p) => (
            <GlassCard key={p.id} className="relative flex flex-col gap-1.5 p-5">
              {p.recommended && (
                <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                  <Sparkles className="h-3 w-3" />
                  {tt('purchase.presets.recommended')}
                </span>
              )}
              <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {tt(p.labelKey)}
              </div>
              <div className="font-display text-3xl font-semibold tabular-nums">
                ${p.amount}
              </div>
              <div className="text-xs leading-snug text-muted-foreground">
                {tt(p.hintKey)}
              </div>
            </GlassCard>
          ))}
        </div>

        <GlassCard
          ref={ref}
          data-reveal=""
          className="mt-8 overflow-hidden p-0"
        >
          <div className="border-b border-white/30 p-6 dark:border-white/10">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-3xl">{t('headline')}</span>
              <span className="text-sm text-muted-foreground">{t('headlineNote')}</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              {(['perks.0', 'perks.1', 'perks.2', 'perks.3'] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-destructive" />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6">
            <h4 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('tableTitle')}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">{t('cols.model')}</th>
                    <th className="py-2 pr-3 font-normal">{t('cols.input')}</th>
                    <th className="py-2 font-normal">{t('cols.output')}</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map((row) => (
                    <tr key={row.model} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{row.model}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{row.input}</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{row.output}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-muted-foreground">{t('tableFootnote')}</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
