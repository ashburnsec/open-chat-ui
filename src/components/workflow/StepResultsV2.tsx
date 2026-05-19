'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Check,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Lightbox } from '@/components/ui/Lightbox';
import type { Iteration, IterationResult } from '@/lib/wizard-types';
import { cn } from '@/lib/utils';

/**
 * M36 wizard step 4 — 4 张候选 grid. 每张 hover 显示 prompt + 两个
 * action: "优化这张" (走 step 5 优化轮) 或 "就选这张" (走 done).
 *
 * 图片网格视觉: rounded-md + hover scale + ring-ink/30 选中状态. 失
 * 败的图卡占位 + 红色边框 + 重试按钮.
 */
export function StepResultsV2({
  iteration,
  busy,
  onOptimize,
  onPickFinal,
  onRetryOne,
}: {
  iteration: Iteration;
  busy: boolean;
  /** 用户选了一张要优化 → 进 step 5 输入新 brief. */
  onOptimize: (sourceUrl: string, sourcePrompt: string) => void;
  /** 用户点 "就选这张" → 写 done message + step='done'. */
  onPickFinal: (finalUrl: string, iter: number) => Promise<void>;
  /** 单张失败重试 (相同 prompt + ref). */
  onRetryOne?: (idx: number) => Promise<void>;
}) {
  const t = useTranslations('workflow.imageGen.results');
  const tHist = useTranslations('workflow.imageGen.history');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const successCount = iteration.results.filter((r) => !r.error && r.url).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 space-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            {tHist('iterationLabel', { n: iteration.iteration })} ·{' '}
            {t('subtitle', { ok: successCount, total: iteration.results.length })}
          </h2>
          {iteration.based_on_url && (
            <span className="rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
              {tHist('basedOnPrev').replace(/^·\s*/, '')}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('title')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {iteration.results.map((r, idx) => (
          <ResultCard
            key={`${iteration.iteration}-${idx}`}
            result={r}
            busy={busy}
            picking={picking === r.url}
            onZoom={() => r.url && setLightboxUrl(r.url)}
            onOptimize={() => r.url && onOptimize(r.url, r.prompt)}
            onPickFinal={async () => {
              if (!r.url) return;
              setPicking(r.url);
              try {
                await onPickFinal(r.url, iteration.iteration);
              } finally {
                setPicking(null);
              }
            }}
            onRetry={onRetryOne ? () => onRetryOne(idx) : undefined}
          />
        ))}
      </div>

      {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}

function ResultCard({
  result,
  busy,
  picking,
  onZoom,
  onOptimize,
  onPickFinal,
  onRetry,
}: {
  result: IterationResult;
  busy: boolean;
  picking: boolean;
  onZoom: () => void;
  onOptimize: () => void;
  onPickFinal: () => Promise<void>;
  onRetry?: () => Promise<void>;
}) {
  const t = useTranslations('workflow.imageGen.results');
  const [retrying, setRetrying] = useState(false);

  if (result.error || !result.url) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-3 text-center">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="line-clamp-3 text-[11px] text-muted-foreground">
          {result.error ?? t('emptyImage')}
        </p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            disabled={retrying || busy}
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetry();
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t('retry')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <figure
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors duration-150',
        'hover:border-ink',
        picking && 'ring-2 ring-ink/30',
      )}
    >
      <button
        type="button"
        onClick={onZoom}
        className="relative block w-full overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.url}
          alt={result.prompt}
          className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        {/* prompt overlay on hover — 限定在 image 区域内, 不会盖到 action bar.
            pointer-events-none 保留以免拦截 onZoom 点击. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-[10px] leading-snug text-white opacity-0 transition-opacity group-hover:opacity-100">
          <span className="line-clamp-3 block">{result.prompt}</span>
        </span>
      </button>
      {/* action bar — 在 button 之外, 永远不会被 hover overlay 遮挡 */}
      <div className="flex items-center justify-between gap-1 border-t border-border/60 bg-background/95 p-2">
        <div className="flex gap-1">
          <a
            href={result.url}
            download={`image-${Date.now()}.png`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('download')}
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {/* M37: 进 P 图编辑器 */}
          <Link
            href={`/editor?image=${encodeURIComponent(result.url)}` as never}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('edit')}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onOptimize}
            disabled={busy}
            className="h-7 px-2 text-[11px]"
          >
            <Sparkles className="h-3 w-3" />
            {t('optimize')}
          </Button>
          <Button
            size="sm"
            onClick={() => void onPickFinal()}
            disabled={busy || picking}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            {picking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trophy className="h-3 w-3" />
            )}
            {t('pickFinal')}
          </Button>
        </div>
      </div>
    </figure>
  );
}
