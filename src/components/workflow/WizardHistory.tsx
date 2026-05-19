'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronRight,
  Copy,
  Download,
  GitBranch,
  History as HistoryIcon,
  Maximize2,
  Pencil,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Iteration } from '@/lib/wizard-types';
import { cn } from '@/lib/utils';

/**
 * M36 历史轮次条 — 显示用户所有迭代过程, 折叠起来. hover/click 展开
 * 4 张缩略图. 让用户能回头看完整心路历程.
 *
 * M36 补漏: 每条轮次右上角加「编辑这轮 prompts」按钮 — 点击后 fork 一
 * 个新分支 (基于这轮的 prompts 现场编辑后重生成), 新轮卡上显示
 * "↻ from 第 N 轮" badge 表明来源.
 *
 * 当前轮 (current iteration) 不在这里渲染, 由 StepResults 主区显示.
 */
export function WizardHistory({
  iterations,
  currentIteration,
  onEditPrompts,
}: {
  iterations: Iteration[];
  /** 当前活跃轮 — 这一轮不进 history 列表, 只展示之前的. */
  currentIteration: number | null;
  /** M36 补漏: 点击「编辑这轮 prompts」, fork 一个新分支基于该轮 prompts. */
  onEditPrompts?: (iteration: Iteration) => void;
}) {
  const t = useTranslations('workflow.imageGen.history');
  const past = iterations.filter(
    (i) => currentIteration == null || i.iteration < currentIteration,
  );
  if (past.length === 0) return null;

  return (
    <details className="group rounded-md border border-border/60 bg-card/40 backdrop-blur-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <HistoryIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('title')}</span>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {past.length}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <ul className="space-y-3 border-t border-border/60 px-4 py-3">
        {past.map((iter) => (
          <IterationStrip key={iter.iteration} iter={iter} onEditPrompts={onEditPrompts} />
        ))}
      </ul>
    </details>
  );
}

function IterationStrip({
  iter,
  onEditPrompts,
}: {
  iter: Iteration;
  onEditPrompts?: (iteration: Iteration) => void;
}) {
  const t = useTranslations('workflow.imageGen.history');
  const ok = iter.results.filter((r) => !r.error && r.url);
  const canEdit = onEditPrompts && (iter.prompts?.length ?? 0) > 0;
  return (
    <li>
      <div className="mb-1.5 flex items-baseline gap-2 text-xs">
        <span className="font-semibold tabular-nums text-foreground">
          {t('iterationLabel', { n: iter.iteration })}
        </span>
        {iter.forked_from && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-canvas-soft px-1.5 py-0.5 text-[10px] font-medium text-ink">
            <GitBranch className="h-2.5 w-2.5" />{' '}
            {t('forkedFrom', { n: iter.forked_from.iteration })}
          </span>
        )}
        <span className="text-muted-foreground">
          {t('successCount', { ok: ok.length, total: iter.results.length })}
          {iter.based_on_url ? ` ${t('basedOnPrev')}` : ''}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEditPrompts!(iter)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-ink hover:text-foreground"
            title={t('editPromptsHint')}
          >
            <Pencil className="h-2.5 w-2.5" />
            {t('editPrompts')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-4">
        {iter.results.map((r, i) =>
          r.url ? (
            <HistoryThumb
              key={`${iter.iteration}-${i}`}
              iteration={iter.iteration}
              idx={i}
              url={r.url}
              prompt={r.prompt}
            />
          ) : (
            <div
              key={`${iter.iteration}-${i}`}
              className="flex aspect-square items-center justify-center rounded-md border border-dashed border-destructive/30 bg-destructive/5 text-[10px] text-muted-foreground"
            >
              {t('failedTile')}
            </div>
          ),
        )}
      </div>
    </li>
  );
}

/** M41 A4: 历史缩略图加 hover 工具栏 (放大 lightbox / 下载 / 复制 url). */
function HistoryThumb({
  iteration,
  idx,
  url,
  prompt,
}: {
  iteration: number;
  idx: number;
  url: string;
  prompt: string;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const filename = `wizard-iter${iteration}-${idx + 1}.png`;
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('链接已复制');
    } catch {
      toast.error('复制失败');
    }
  }
  return (
    <>
      <div
        title={prompt}
        className="group/img relative aspect-square overflow-hidden rounded-md border border-border transition-colors hover:border-ink"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={prompt}
          className="h-full w-full object-cover transition-transform group-hover/img:scale-105"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-black/40 to-transparent p-1 opacity-0 transition-opacity group-hover/img:pointer-events-auto group-hover/img:opacity-100">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            title="放大查看"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground transition-colors hover:bg-background"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <a
            href={url}
            download={filename}
            target="_blank"
            rel="noreferrer"
            title="下载"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground transition-colors hover:bg-background"
          >
            <Download className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={copyUrl}
            title="复制链接"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground transition-colors hover:bg-background"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={prompt}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-background"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-4 left-1/2 max-w-xl -translate-x-1/2 rounded-md bg-background/90 p-3 text-xs text-foreground">
            <p className="line-clamp-3">{prompt}</p>
          </div>
        </div>
      )}
    </>
  );
}
