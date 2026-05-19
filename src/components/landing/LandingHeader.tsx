'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/shell/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

/**
 * Sticky landing header with iOS-26 glass surface that intensifies as
 * the user scrolls past ~40px. Holds the brand mark + theme/language
 * controls + sign-in / sign-up CTAs.
 *
 * Brand text "Open Chat" stays in Chinese characters in both locales — a
 * deliberate styling choice (logo-as-text) approved in the M19 plan.
 */
export function LandingHeader({
  onOpenAuth,
}: {
  onOpenAuth: (tab: 'sign-in' | 'sign-up') => void;
}) {
  const t = useTranslations('landing.header');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={
        'sticky top-0 z-30 transition-all duration-300 ' +
        (scrolled
          ? 'border-b border-white/30 bg-background/70 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/5 dark:bg-background/60'
          : 'border-b border-transparent bg-transparent')
      }
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <span className="font-display text-lg tracking-tight">
          {t('brand')}
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <button
            type="button"
            onClick={() => onOpenAuth('sign-in')}
            className="hidden h-9 items-center justify-center rounded-full px-4 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
          >
            {t('signIn')}
          </button>
          <button
            type="button"
            onClick={() => onOpenAuth('sign-up')}
            className="inline-flex h-9 items-center justify-center rounded-full bg-ink px-4 text-xs font-medium text-primary-foreground transition-shadow hover:shadow-[var(--shadow-button)]"
          >
            {t('signUp')}
          </button>
        </div>
      </div>
    </header>
  );
}
