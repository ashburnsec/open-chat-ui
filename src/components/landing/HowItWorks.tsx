'use client';

import { useTranslations } from 'next-intl';
import { useReveal } from './use-reveal';
import { SectionHeader } from './Features';

/** Three big steps with a number + emoji + short copy. Connected by
 *  a horizontal gradient line on >sm screens. */
const STEPS = ['1', '2', '3'] as const;
const EMOJIS = ['📝', '🎯', '🚀'] as const;

export function HowItWorks() {
  const t = useTranslations('landing.how');
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <SectionHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="relative mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
          {/* Connector line — only shows on ≥sm. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[16%] right-[16%] top-12 hidden h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent sm:block"
          />
          {STEPS.map((n, i) => (
            <Step key={n} stepKey={n} index={i} emoji={EMOJIS[i]!} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({
  stepKey,
  index,
  emoji,
}: {
  stepKey: '1' | '2' | '3';
  index: number;
  emoji: string;
}) {
  const t = useTranslations(`landing.how.steps.${stepKey}`);
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-reveal=""
      className="relative flex flex-col items-center text-center"
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/40 bg-card/80 shadow-[var(--shadow-soft)] backdrop-blur-2xl ring-1 ring-white/40 dark:border-white/10 dark:bg-white/5 dark:ring-white/10">
        <span className="text-4xl" aria-hidden>
          {emoji}
        </span>
        <span className="absolute -top-2 -left-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink font-mono text-xs text-primary-foreground">
          {stepKey}
        </span>
      </div>
      <h3 className="mt-5 text-base font-semibold">{t('title')}</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {t('desc')}
      </p>
    </div>
  );
}
