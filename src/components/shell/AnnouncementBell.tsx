'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Announcement = {
  content: string;
  publishDate: string;
  type?: 'default' | 'ongoing' | 'success' | 'warning' | 'error';
  extra?: string;
};

const TYPE_STYLES: Record<NonNullable<Announcement['type']>, string> = {
  default: 'border-border bg-card',
  ongoing: 'border-blue-300/40 bg-blue-50/60 dark:bg-blue-950/30',
  success: 'border-green-300/40 bg-green-50/60 dark:bg-green-950/30',
  warning: 'border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/30',
  error: 'border-rose-300/40 bg-rose-50/60 dark:bg-rose-950/30',
};

const STORAGE_KEY = 'cp:dismissed_announcement_dates';

/**
 * Reads announcements from newapi `/api/status` (public endpoint, no auth
 * required) — newapi exposes a console_setting.announcements JSON array
 * keyed by publishDate. We auto-pop the modal on first visit per
 * announcement-date, then offer a button in TopNav to re-open.
 *
 * Dismissals are stored client-side in localStorage so admins can edit
 * announcements freely without minting new IDs.
 */
export function AnnouncementBell() {
  const t = useTranslations('announcement');
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const r = await fetch('/api/newapi/api/status');
      const j = await r.json();
      const list: Announcement[] = (j?.data?.announcements ?? []).filter(
        (a: Announcement) => !!a?.content,
      );
      setItems(list);
      // Auto-open if there's at least one un-dismissed item
      if (list.length === 0) return;
      const dismissed = readDismissed();
      const hasNew = list.some((a) => !dismissed.has(a.publishDate));
      if (hasNew) setOpen(true);
    } catch {
      setItems([]);
    }
  }

  function dismissAll() {
    if (!items) return;
    const dismissed = readDismissed();
    items.forEach((a) => dismissed.add(a.publishDate));
    writeDismissed(dismissed);
    setOpen(false);
  }

  if (!items || items.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title={t('openLabel')}
        aria-label={t('openLabel')}
        className="h-9 w-9"
      >
        <Bell className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t('title')}
            </DialogTitle>
            <DialogDescription className="sr-only">{t('title')}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {items.map((a, i) => {
              const styles = TYPE_STYLES[a.type ?? 'default'];
              const date = formatDate(a.publishDate);
              return (
                <div
                  key={`${a.publishDate}-${i}`}
                  className={cn('rounded-lg border p-3 text-sm', styles)}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{date}</span>
                    {a.type && a.type !== 'default' && (
                      <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase">
                        {a.type}
                      </span>
                    )}
                  </div>
                  <div className="text-foreground">{a.content}</div>
                  {a.extra && (
                    <div className="mt-1 text-xs text-muted-foreground">{a.extra}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <Button onClick={dismissAll} size="sm">
              <X className="h-4 w-4" />
              {t('dismiss')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissed(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota / private mode — ignore */
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
