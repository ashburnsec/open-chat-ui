'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales';
import { cn } from '@/lib/utils';

/**
 * Compact language switcher for HeaderBar — same circular footprint as
 * ThemeToggle. Opens a small dropdown with the available locales; on
 * pick, POSTs to /api/locale (writes the cookie) then router-refreshes
 * so next-intl re-resolves messages on the next render.
 *
 * The fuller switcher with descriptive copy lives at /settings → 偏好.
 */
export function LanguageToggle() {
  const router = useRouter();
  const current = useLocale() as Locale;
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === current || pending) return;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tNav('toggleLanguage')}
          title={LOCALE_LABELS[current]}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Languages className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onSelect={() => pick(loc)}
            className={cn(loc === current && 'bg-accent text-accent-foreground')}
          >
            {LOCALE_LABELS[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
