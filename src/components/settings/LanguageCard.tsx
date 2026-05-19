'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales';

/**
 * Language switcher. Writes the cookie via `/api/locale` then triggers
 * a full router refresh so the new server-rendered messages take over.
 */
export function LanguageCard() {
  const t = useTranslations('settings.preferences');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const current = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === current) return;
    startTransition(async () => {
      try {
        const r = await fetch('/api/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
        const j = await r.json();
        if (!j?.success) throw new Error('failed');
        router.refresh();
      } catch {
        toast.error(tCommon('error'));
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <Label>{t('language')}</Label>
        </div>
        <p className="text-xs text-muted-foreground">{t('languageHint')}</p>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              disabled={pending}
              onClick={() => pick(loc)}
              className={
                'rounded-md border px-3 py-1.5 text-sm transition ' +
                (loc === current
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent')
              }
            >
              {LOCALE_LABELS[loc]}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
