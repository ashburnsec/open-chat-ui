'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { useReveal } from './use-reveal';
import { SectionHeader } from './Features';

/**
 * Six-question FAQ. Uses native `<details>` / `<summary>` so it's
 * keyboard-accessible without a JS accordion library; the chevron
 * rotates via `[open]` attribute selector in CSS-in-JS.
 */
const QUESTIONS = ['data', 'choose', 'topup', 'api', 'web', 'image'] as const;

export function FAQ() {
  const t = useTranslations('landing.faq');
  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <SectionHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="mt-10 space-y-3">
          {QUESTIONS.map((k, i) => (
            <FAQItem key={k} qKey={k} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({
  qKey,
  index,
}: {
  qKey: (typeof QUESTIONS)[number];
  index: number;
}) {
  const t = useTranslations(`landing.faq.items.${qKey}`);
  const ref = useReveal<HTMLDivElement>();
  return (
    <GlassCard
      ref={ref}
      data-reveal=""
      className="p-0 transition-colors"
      style={{ transitionDelay: `${index * 40}ms` }}
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>{t('q')}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
          {t('a')}
        </div>
      </details>
    </GlassCard>
  );
}
