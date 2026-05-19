'use client';

import { useTranslations } from 'next-intl';
import { GlassCard } from './GlassCard';
import { useReveal } from './use-reveal';
import { SectionHeader } from './Features';

/**
 * Static promo for the 12 system agents (M13). Hard-codes the first 8
 * by emoji + i18n key — fetching from /api/agents on the public
 * landing page would expose model names + system prompts to anonymous
 * visitors, which we don't want.
 *
 * If you add a new system agent slug, append it here too.
 */
const FEATURED = [
  { slug: 'sys-writing', emoji: '✍️' },
  { slug: 'sys-coder', emoji: '💻' },
  { slug: 'sys-translate', emoji: '🌐' },
  { slug: 'sys-product', emoji: '📋' },
  { slug: 'sys-marketing', emoji: '📣' },
  { slug: 'sys-tech-blog', emoji: '📝' },
  { slug: 'sys-nutrition', emoji: '🥗' },
  { slug: 'sys-travel', emoji: '🧳' },
] as const;

export function AgentsShowcase() {
  const t = useTranslations('landing.agents');
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {FEATURED.map((a, i) => (
            <AgentCard key={a.slug} slug={a.slug} emoji={a.emoji} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentCard({
  slug,
  emoji,
  index,
}: {
  slug: string;
  emoji: string;
  index: number;
}) {
  const t = useTranslations(`landing.agents.items.${slug}`);
  const ref = useReveal<HTMLDivElement>();
  return (
    <GlassCard
      ref={ref}
      data-reveal=""
      className="flex h-full flex-col p-5 transition-transform hover:-translate-y-1"
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <h3 className="mt-3 text-sm font-semibold">{t('name')}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('desc')}</p>
    </GlassCard>
  );
}
