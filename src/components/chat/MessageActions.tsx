'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SpeakButton } from '@/components/chat/SpeakButton';

/**
 * Hover-revealed action row for a single message bubble. The actions vary
 * by role:
 *   user       → 复制 · 编辑重发 · 删除
 *   assistant  → 复制 · 重新生成 · 删除
 *
 * We render below the bubble (rather than inside) so streaming content
 * doesn't trigger layout reflow on the buttons every chunk.
 */
export function MessageActions({
  role,
  text,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  disabled,
  align,
}: {
  role: 'user' | 'assistant';
  text: string;
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  disabled?: boolean;
  /** Match the bubble's side so the action row sits under it. */
  align: 'left' | 'right';
}) {
  const t = useTranslations('chat.message');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy();
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <div
      className={cn(
        // M30: opaque on touch (sm-and-down) so phone users can reach
        // the buttons without a hover gesture; desktop keeps the
        // fade-in-on-hover behaviour.
        'mt-1 flex gap-0.5 text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      <Btn label={copied ? t('copied') : t('copy')} onClick={copy} disabled={disabled}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Btn>
      {role === 'assistant' && onRegenerate && (
        <Btn label={t('regenerate')} onClick={onRegenerate} disabled={disabled}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Btn>
      )}
      {role === 'assistant' && text && <SpeakButton text={text} />}
      {role === 'user' && onEdit && (
        <Btn label={t('editResend')} onClick={onEdit} disabled={disabled}>
          <Pencil className="h-3.5 w-3.5" />
        </Btn>
      )}
      <Btn label={t('delete')} onClick={onDelete} disabled={disabled} variant="destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </Btn>
    </div>
  );
}

function Btn({
  children,
  label,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'destructive';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
        'hover:bg-accent hover:text-foreground',
        variant === 'destructive' && 'hover:bg-destructive/10 hover:text-destructive',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {children}
    </button>
  );
}
