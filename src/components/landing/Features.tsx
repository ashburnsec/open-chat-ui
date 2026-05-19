'use client';

import { useTranslations } from 'next-intl';
import {
  Globe,
  Brain,
  ImageIcon,
  FileText,
  Sparkles,
  GitBranch,
  type LucideIcon,
} from 'lucide-react';
import { GlassCard } from './GlassCard';
import { useReveal } from './use-reveal';

/**
 * Six-card feature grid: each card has an icon + title + 1-2 sentence
 * blurb. Cards reveal on scroll via the `useReveal` hook (per-card so
 * they cascade as the section enters).
 */

type FeatureKey =
  | 'multiModel'
  | 'agents'
  | 'webSearch'
  | 'docs'
  | 'images'
  | 'branching';

const ICONS: Record<FeatureKey, LucideIcon> = {
  multiModel: Sparkles,
  agents: Brain,
  webSearch: Globe,
  docs: FileText,
  images: ImageIcon,
  branching: GitBranch,
};

const KEYS: FeatureKey[] = ['multiModel', 'agents', 'webSearch', 'docs', 'images', 'branching'];

export function Features() {
  const t = useTranslations('landing.features');
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {KEYS.map((k, i) => (
            <FeatureCard key={k} feature={k} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: FeatureKey; index: number }) {
  const t = useTranslations(`landing.features.items.${feature}`);
  const Icon = ICONS[feature];
  const ref = useReveal<HTMLDivElement>();
  return (
    <GlassCard
      ref={ref}
      data-reveal=""
      className="p-6 transition-transform hover:-translate-y-1"
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{t('title')}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('desc')}</p>
    </GlassCard>
  );
}

export function SectionHeader({
  title,
  subtitle,
  align = 'center',
}: {
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-reveal=""
      className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}
    >
      <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      )}
    </div>
  );
}
