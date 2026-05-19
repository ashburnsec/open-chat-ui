'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HelpCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
type FaqItem = { question: string; answer: string };

const APP_VERSION = '0.33.0';

/**
 * Help dropdown in TopNav: surfaces newapi `/api/status` faq array as
 * an accordion modal, plus a contact link and the chat-portal app
 * version. Both FAQ list and contact mailto are admin-editable in
 * newapi (console_setting.faq + footer), so this component reads them
 * fresh on click rather than caching at SSR.
 */
export function HelpMenu({ contactEmail }: { contactEmail?: string }) {
  const t = useTranslations('helpMenu');
  const [faq, setFaq] = useState<FaqItem[] | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);

  useEffect(() => {
    if (!faqOpen || faq !== null) return;
    void load();
  }, [faqOpen]);

  async function load() {
    try {
      const r = await fetch('/api/newapi/api/status');
      const j = await r.json();
      setFaq((j?.data?.faq ?? []) as FaqItem[]);
    } catch {
      setFaq([]);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title={t('openLabel')}
            aria-label={t('openLabel')}
            className="h-9 w-9"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setFaqOpen(true)}>
            <HelpCircle className="h-4 w-4" />
            <span>{t('faq')}</span>
          </DropdownMenuItem>
          {contactEmail && (
            <DropdownMenuItem asChild>
              <a href={`mailto:${contactEmail}`}>
                <Mail className="h-4 w-4" />
                <span>{t('contact')}</span>
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('version', { version: APP_VERSION })}
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={faqOpen} onOpenChange={setFaqOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('faq')}</DialogTitle>
            <DialogDescription className="sr-only">{t('faq')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {faq === null ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                ...
              </div>
            ) : faq.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                —
              </div>
            ) : (
              <div className="divide-y">
                {faq.map((q, i) => (
                  <details key={i} className="group py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium hover:text-primary">
                      <span className="text-left">{q.question}</span>
                      <span className="shrink-0 text-xs text-muted-foreground transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {q.answer}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
