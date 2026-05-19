'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import type { CollaborationDetail } from '@/hooks/use-chat-stream';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { cn } from '@/lib/utils';

/**
 * M31-A: collapsed "show N original answers" panel rendered below the
 * merged answer on collaboration turns. Default-collapsed because the
 * reducer's merged answer is the primary read; users open this to
 * compare or inspect a specific model's take.
 */
export function CollaborationDetails({
  details,
}: {
  details: CollaborationDetail[];
}) {
  const t = useTranslations('chat.collaboration');
  const [open, setOpen] = useState(false);
  if (!details || details.length === 0) return null;

  const succeeded = details.filter((d) => !d.error && d.content);
  const failed = details.filter((d) => d.error);

  return (
    <div className="mt-3 rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span>
          {t('panelLabel', { n: succeeded.length })}
          {failed.length > 0 && (
            <span className="ml-1.5 text-destructive">
              · {t('failedSuffix', { n: failed.length })}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {details.map((d, i) => (
            <div
              key={`${d.model}-${i}`}
              className={cn(
                'rounded-lg border bg-card p-3 text-xs',
                d.error && 'border-destructive/30 bg-destructive/5',
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center">
                  <VendorMonogram model={d.model} size={16} />
                </div>
                <span className="font-medium text-foreground">{d.model}</span>
                <span className="ml-auto text-muted-foreground">
                  {d.durationMs ? `${(d.durationMs / 1000).toFixed(1)}s` : ''}
                  {(d.promptTokens ?? 0) + (d.completionTokens ?? 0) > 0 && (
                    <>
                      {d.durationMs ? ' · ' : ''}
                      {d.promptTokens ?? 0}/{d.completionTokens ?? 0}t
                    </>
                  )}
                </span>
              </div>
              {d.error ? (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-words font-mono text-[11px]">
                    {d.error}
                  </span>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <MarkdownContent content={d.content} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
