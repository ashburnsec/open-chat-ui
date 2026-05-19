'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Moon, Sun, Monitor } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Three-way theme picker (light / dark / system) for the header / dropdown.
 * Defers showing the picked-state icon until after mount so SSR and CSR
 * agree (next-themes resolves theme on the client).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('common');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const Icon = !mounted
    ? Sun
    : theme === 'dark'
      ? Moon
      : theme === 'light'
        ? Sun
        : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('toggleTheme')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onSelect={() => setTheme('light')} className={cn(theme === 'light' && 'bg-accent')}>
          <Sun className="h-3.5 w-3.5" /> {t('themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')} className={cn(theme === 'dark' && 'bg-accent')}>
          <Moon className="h-3.5 w-3.5" /> {t('themeDark')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')} className={cn(theme === 'system' && 'bg-accent')}>
          <Monitor className="h-3.5 w-3.5" /> {t('themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
