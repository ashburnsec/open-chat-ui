'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Check, Trash2 } from 'lucide-react';
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
import { useConfirm } from '@/hooks/use-confirm';

/**
 * M31-B: share-link modal. Mints a share URL on first open (or reuses the
 * existing one — the conv-svc POST /share endpoint is idempotent), shows
 * the URL with copy + revoke. Closing the modal does NOT revoke; revoke
 * is an explicit action so a stray click can't break a link the user
 * already pasted into Slack.
 */
export function ShareModal({
  conversationId,
  conversationTitle,
  open,
  onOpenChange,
}: {
  conversationId: string | null;
  conversationTitle: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const t = useTranslations('history.share');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mint when the modal opens. Server endpoint is idempotent so calling
  // it twice in a row returns the existing token; no risk of duplicate.
  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setBusy(true);
    setCopied(false);
    setUrl(null);
    (async () => {
      try {
        const r = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/share`,
          { method: 'POST' },
        );
        const j = (await r.json()) as {
          success: boolean;
          message?: string;
          data?: { url?: string };
        };
        if (cancelled) return;
        if (!j.success || !j.data?.url) {
          toast.error(j.message || tCommon('unknownError'));
          onOpenChange(false);
          return;
        }
        setUrl(j.data.url);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'failed');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, onOpenChange, tCommon]);

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  async function revoke() {
    if (!conversationId) return;
    const ok = await confirm({
      title: t('revokeConfirmTitle'),
      description: t('revokeConfirm'),
      confirmLabel: t('revoke'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/share`,
        { method: 'DELETE' },
      );
      const j = (await r.json()) as { success: boolean; message?: string };
      if (!j.success) {
        toast.error(j.message || tCommon('unknownError'));
        return;
      }
      toast.success(t('revoked'));
      setUrl(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { title: conversationTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url ?? (busy ? t('minting') : '')}
            placeholder={t('minting')}
            className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyUrl()}
            disabled={!url || busy}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> {t('copied')}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> {t('copy')}
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('readonlyHint')}</p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void revoke()}
            disabled={!url || busy}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> {t('revoke')}
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            {t('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
