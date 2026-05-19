'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, Sparkles } from 'lucide-react';
import { MeshGradient } from '@/components/landing/MeshGradient';

/**
 * M44 · Vercel hero-band. Mesh gradient 唯一装饰, 单 ink 黑 pill 作 CTA,
 * 副 CTA 白 pill + hairline. 删除原暖色 drifting orbs (跟 Vercel 黑白 + mesh
 * 调性冲突).
 *
 * Stagger 入场动画 (`[data-stagger]`) 保留, 内容仍 5 段渐显.
 */
export function Hero({
  onOpenAuth,
}: {
  onOpenAuth: (tab: 'sign-in' | 'sign-up') => void;
}) {
  const t = useTranslations('landing.hero');
  return (
    <section className="relative isolate overflow-hidden px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
      {/* Vercel mesh gradient — landing hero 唯一装饰 (atmospheric backdrop). */}
      <MeshGradient />

      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <span
          data-stagger="1"
          className="mb-6 inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-canvas px-3 py-1 text-xs text-body shadow-[var(--shadow-2)]"
        >
          <Sparkles className="h-3 w-3 text-ink" />
          {t('badge')}
        </span>
        <h1
          data-stagger="2"
          className="text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-5xl md:text-6xl lg:text-7xl"
        >
          {t('headline1')}
          <br />
          {t('headline2')}
        </h1>
        <p
          data-stagger="3"
          className="mt-6 max-w-2xl text-base leading-relaxed text-body sm:text-lg"
        >
          {t('subtitle')}
        </p>
        <div data-stagger="4" className="mt-10 flex flex-col gap-3 sm:flex-row">
          {/* button-primary (Vercel 100px pill, ink 黑 marketing CTA) */}
          <button
            type="button"
            onClick={() => onOpenAuth('sign-up')}
            className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-ink px-7 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-ink/85"
          >
            {t('ctaPrimary')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          {/* button-secondary (Vercel 100px pill, canvas + hairline) */}
          <a
            href="#features"
            className="inline-flex h-12 items-center justify-center rounded-pill border border-hairline bg-canvas px-7 text-[15px] font-medium text-ink transition-colors hover:bg-canvas-soft"
          >
            {t('ctaSecondary')}
          </a>
        </div>
        <p data-stagger="5" className="mt-6 text-xs text-body">
          {t('socialProof')}
        </p>
      </div>
    </section>
  );
}
