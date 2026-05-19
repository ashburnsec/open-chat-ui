'use client';

import { useTranslations } from 'next-intl';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { GlassCard } from './GlassCard';
import { useReveal } from './use-reveal';
import { SectionHeader } from './Features';

/**
 * Visual showcase of supported model families. Each card carries the
 * vendor monogram (already brand-coloured) plus a 2-3 model lineup.
 *
 * Stays static — no live fetch, no upstream call. The roster matches
 * what the production new-api channels expose; tweak this list when
 * adding/removing models on your upstream.
 */
const FAMILIES = [
  { vendor: 'gpt-5.4', label: 'OpenAI', models: ['GPT-5.4', 'GPT-5.5', 'GPT-5.4-mini'] },
  { vendor: 'deepseek-v3', label: 'DeepSeek', models: ['V3.1', 'V3.2', 'V4-Flash'] },
  { vendor: 'kimi-k2', label: 'Moonshot', models: ['Kimi-K2.5', 'Kimi-K2.6'] },
  { vendor: 'grok-4', label: 'xAI', models: ['Grok-4 (reasoning)', 'Grok-4 (fast)'] },
  { vendor: 'gpt-image-2', label: 'Image', models: ['gpt-image-2'] },
] as const;

export function ModelsShowcase() {
  const t = useTranslations('landing.models');
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {FAMILIES.map((f, i) => (
            <ModelCard key={f.vendor} family={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModelCard({
  family,
  index,
}: {
  family: (typeof FAMILIES)[number];
  index: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <GlassCard
      ref={ref}
      data-reveal=""
      className="flex flex-col items-center gap-3 p-5 text-center transition-transform hover:-translate-y-1"
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <VendorMonogram model={family.vendor} size={36} />
      <div className="text-xs font-medium text-muted-foreground">{family.label}</div>
      <ul className="space-y-0.5 text-xs">
        {family.models.map((m) => (
          <li key={m} className="font-mono">
            {m}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
