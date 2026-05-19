'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Read-only fenced code block with a sticky copy button. We don't pull
 * in a full syntax-highlighter to keep the bundle small — `font-mono`
 * + monochrome muted background reads fine for env-var snippets and
 * curl one-liners.
 *
 * `copyValue` lets callers copy something different from what's shown
 * (e.g. show a placeholder but copy a real key). Falls back to `code`.
 */
export function CodeBlock({
  code,
  copyValue,
  copyLabel,
  copiedLabel,
  ariaLabel,
  className,
}: {
  code: string;
  copyValue?: string;
  copyLabel: string;
  copiedLabel: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue ?? code);
      setCopied(true);
      toast.success(copiedLabel);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  }
  return (
    <div className={cn('group relative rounded-md border bg-muted/30', className)}>
      <button
        type="button"
        onClick={copy}
        aria-label={ariaLabel ?? copyLabel}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        <span>{copied ? copiedLabel : copyLabel}</span>
      </button>
      <pre className="overflow-x-auto p-4 pr-24 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
