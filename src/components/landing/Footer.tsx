'use client';

import { useTranslations } from 'next-intl';

/**
 * Three-column footer: brand + tagline · product links · legal +
 * copyright. Stays terse — the landing page already covers most
 * navigation, footer is the legal-trust signal.
 */
export function Footer() {
  const t = useTranslations('landing.footer');
  return (
    <footer className="mt-12 border-t border-border/50 bg-background/40 backdrop-blur-md">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 sm:grid-cols-3">
        <div>
          <div className="font-display text-lg">{t('brand')}</div>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {t('tagline')}
          </p>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <h4 className="mb-3 font-semibold uppercase tracking-wider text-foreground">
            {t('product')}
          </h4>
          <a href="#features" className="block transition-colors hover:text-foreground">
            {t('linkFeatures')}
          </a>
          <a href="#pricing" className="block transition-colors hover:text-foreground">
            {t('linkPricing')}
          </a>
          <a href="#faq" className="block transition-colors hover:text-foreground">
            {t('linkFAQ')}
          </a>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <h4 className="mb-3 font-semibold uppercase tracking-wider text-foreground">
            {t('legal')}
          </h4>
          <span className="block">{t('privacy')}</span>
          <span className="block">{t('terms')}</span>
          <span className="block">{t('contact')}</span>
        </div>
      </div>
      <div className="border-t border-border/50 px-6 py-5 text-center text-[11px] text-muted-foreground">
        {t('copyright')}
      </div>
    </footer>
  );
}
