'use client';

import { memo, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Render an assistant message body as Markdown.
 *
 * Plugins:
 *   - remarkGfm     → GitHub-flavored: tables, strikethrough, task lists, autolinks
 *   - rehypeHighlight → highlight.js syntax highlighting (theme via globals.css)
 *
 * Custom code-block renderer adds a "复制" button per ` ``` ` block. Inline
 * `code` keeps the default highlight.js styling.
 *
 * Memoized: incremental streaming re-renders this dozens of times per second
 * with mostly-identical input. Memo on `content` keeps the markdown parser
 * idle when text isn't changing.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  onZoomImage,
}: {
  content: string;
  /** Optional zoom callback. When provided, every inline `<img>` (a
   *  Markdown image — works for both `data:` URLs from gemini
   *  *-image-preview models and remote URLs) becomes clickable and
   *  opens the parent's Lightbox. Pass a `useCallback`-stable
   *  reference to keep `memo` working. */
  onZoomImage?: (src: string) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        // Disable the default <p> margins inside list items / blockquotes
        // — react-markdown wraps every paragraph, but in chat bubbles the
        // bottom margin doubles up with our own gap classes.
        p: ({ node, children, ...props }) => (
          <p className="my-2 first:mt-0 last:mb-0" {...props}>
            {children}
          </p>
        ),
        h1: ({ node, children, ...props }) => (
          <h1 className="my-3 text-lg font-semibold" {...props}>
            {children}
          </h1>
        ),
        h2: ({ node, children, ...props }) => (
          <h2 className="my-3 text-base font-semibold" {...props}>
            {children}
          </h2>
        ),
        h3: ({ node, children, ...props }) => (
          <h3 className="my-2 text-sm font-semibold" {...props}>
            {children}
          </h3>
        ),
        ul: ({ node, children, ...props }) => (
          <ul className="my-2 ml-5 list-disc space-y-1" {...props}>
            {children}
          </ul>
        ),
        ol: ({ node, children, ...props }) => (
          <ol className="my-2 ml-5 list-decimal space-y-1" {...props}>
            {children}
          </ol>
        ),
        a: ({ node, children, ...props }) => (
          <a className="text-link underline underline-offset-2 hover:text-link-deep" target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        ),
        blockquote: ({ node, children, ...props }) => (
          <blockquote className="my-2 border-l-2 border-border pl-3 italic text-muted-foreground" {...props}>
            {children}
          </blockquote>
        ),
        table: ({ node, children, ...props }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ node, children, ...props }) => (
          <th className="border bg-muted/50 px-2 py-1 text-left font-medium" {...props}>
            {children}
          </th>
        ),
        td: ({ node, children, ...props }) => (
          <td className="border px-2 py-1" {...props}>
            {children}
          </td>
        ),
        // Inline images: gemini-3.x *-image-preview returns its output as
        // `![image](data:image/png;base64,...)` inside the chat content,
        // and ordinary remote-URL Markdown images appear here too. We
        // wrap them in a button so the parent Lightbox handles zoom + the
        // download action lives in one place. Falls back to a plain <img>
        // when no onZoomImage callback is wired up (no behaviour change
        // from the previous default rendering).
        img: ({ node, src, alt, ...props }) => {
          if (!src || typeof src !== 'string') return null;
          if (!onZoomImage) {
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={src} alt={alt ?? ''} className="my-2 max-h-[480px] rounded-md" {...props} />;
          }
          return (
            <button
              type="button"
              onClick={() => onZoomImage(src)}
              className="my-2 block overflow-hidden rounded-md bg-muted/40"
              aria-label={alt || 'View image'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt ?? ''}
                className="max-h-[480px] w-full object-contain transition-opacity hover:opacity-95"
              />
            </button>
          );
        },
        // pre is the wrapper rehype-highlight emits around code blocks.
        // Wrap it in our own copy-equipped CodeBlock; inline code (no <pre>
        // ancestor) is left to the default <code> rendering below.
        pre: ({ node, children, ...props }) => (
          <CodeBlock>{children}</CodeBlock>
        ),
        code: ({ node, className, children, ...props }) => {
          // rehype-highlight assigns a `language-xxx hljs` className to the
          // <code> inside <pre>; we inherit it so highlight.js classes apply.
          return (
            <code
              className={cn(
                className,
                // Inline (no language class) → muted background pill.
                !className && 'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]',
              )}
              {...props}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

/**
 * Wraps a code block with a "复制" button that briefly flips to "已复制".
 * Pulls the textual content out of the rendered children tree at click time.
 */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const t = useTranslations('chat.message');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      // children is a React tree; the <code> child carries the original text
      // as its `children` prop. Walking the React tree is fragile, so we
      // read it off the DOM instead — simpler and matches what the user sees.
      const node = document.activeElement?.closest('.cp-codeblock');
      const text = node?.querySelector('code')?.textContent ?? '';
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* permission denied / no clipboard — fall through */
    }
  }

  return (
    <div className="cp-codeblock group relative my-2 overflow-hidden rounded-lg border bg-muted/40">
      <button
        type="button"
        onClick={copy}
        className="absolute right-1.5 top-1.5 inline-flex h-7 items-center gap-1 rounded-md bg-background/80 px-2 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label={t('copyCode')}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? t('copied') : t('copy')}
      </button>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-snug">{children}</pre>
    </div>
  );
}
