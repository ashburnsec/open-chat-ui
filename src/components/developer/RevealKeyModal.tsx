'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * "This is the only time you'll see the full key" modal — modeled on
 * GitHub's PAT-creation flow. Triggered after a successful token POST
 * in KeysPanel; the parent fetches the cleartext via the new-api
 * reveal endpoint and hands it in.
 *
 * Hard-locked: ESC, outside click, and the default × button are all
 * suppressed. The user *must* press the explicit "I've copied it"
 * button — that's the only path that calls onClose.
 */
export function RevealKeyModal({
  open,
  fullKey,
  tokenName,
  loading = false,
  onClose,
}: {
  open: boolean;
  fullKey: string | null;
  tokenName: string;
  loading?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('keys');
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!fullKey) return;
    try {
      await navigator.clipboard.writeText(fullKey);
      setCopied(true);
      toast.success(t('reveal.copied'));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('reveal.failed'));
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-lg"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas-soft text-ink">
              <KeyRound className="h-4 w-4" />
            </span>
            <DialogTitle>{tokenName}</DialogTitle>
          </div>
          <DialogDescription>{t('showOnceWarning')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {loading ? (
            <div className="flex h-20 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : fullKey ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-3">
                <code className="flex-1 break-all font-mono text-xs">{fullKey}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copy}
                  className="shrink-0 gap-1.5"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? t('copied') : t('copy')}
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span>{t('showOnceWarning')}</span>
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
              {t('reveal.failed')}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} disabled={loading}>
            {copied ? t('actions.save') : t('reveal.shown')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
