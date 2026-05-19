'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, Film, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoCard } from '@/components/chat/VideoCard';
import { cn } from '@/lib/utils';
import type { VideoSegment, VideoSegmentResult } from '@/lib/wizard-types';

/**
 * M42-S5 PR-B · storyboard 视频逐段生成视图.
 *
 * 渲染所有段卡片:
 *  - 已完成段: 首尾帧缩略 + VideoCard (播视频, 复用 chat 流的 hook 轮询)
 *  - 当前生成中段: VideoCard 显进度
 *  - 待生成段: 灰色占位 + 「继续生成段 N」按钮 (仅最近一个未生成段可点)
 *
 * Veo 任务由 useVideoTask hook 内部轮询 conv-svc /v1/videos/:taskId.
 * 父通过 onTaskUpdate 把最新 task patch 进 state, 保证页面刷新后状态延续.
 */
export function StepStoryboardVideoGen({
  plan,
  segments,
  busy,
  onGenerateSegment,
  onTaskUpdate,
}: {
  /** 完整 N 段规划 (LLM 在 PR-A 输出) */
  plan: VideoSegment[];
  /** 已经触发生成的段 (含 pending/generating/completed/failed). */
  segments: VideoSegmentResult[];
  busy: boolean;
  /** 用户点 "继续生成段 N" — 父调 step='video_segment' POST */
  onGenerateSegment: (seq: number) => void | Promise<void>;
  /** VideoCard 内 useVideoTask 轮询拿到新 task 状态 → patch 进 state. */
  onTaskUpdate: (seq: number, task: VideoSegmentResult['videoTask']) => void;
}) {
  const t = useTranslations('workflow.storyboard.videoGen');

  const segmentBySeq = new Map(segments.map((s) => [s.seq, s] as const));
  // 找到第一个还没生成的段 (用户可点的"下一段")
  const nextSeqToGen = plan.find((p) => !segmentBySeq.has(p.seq))?.seq ?? null;
  const allCompleted =
    plan.length > 0 &&
    plan.every((p) => {
      const r = segmentBySeq.get(p.seq);
      return r && r.videoTask.status === 'completed';
    });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Film className="h-5 w-5 text-ink" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* 进度摘要 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs">
        <span>
          {t('progress')}:{' '}
          <span className="font-medium tabular-nums text-foreground">
            {segments.filter((s) => s.videoTask.status === 'completed').length}
          </span>
          {' / '}
          <span className="tabular-nums">{plan.length}</span>
        </span>
        {allCompleted && (
          <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {t('allDone')}
          </span>
        )}
      </div>

      {/* 段卡片列表 */}
      <div className="space-y-3">
        {plan.map((p) => {
          const segment = segmentBySeq.get(p.seq);
          return (
            <SegmentCard
              key={p.seq}
              plan={p}
              segment={segment}
              isNextToGenerate={nextSeqToGen === p.seq}
              busy={busy}
              onGenerate={() => onGenerateSegment(p.seq)}
              onTaskUpdate={(task) => onTaskUpdate(p.seq, task)}
            />
          );
        })}
      </div>

      {/* 底部 — 全部完成 + 完成按钮 */}
      {allCompleted && (
        <div className="rounded-md border border-ink bg-accent/40 p-4">
          <p className="text-sm font-medium text-ink">{t('finishedHint')}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('finishedHintSub')}</p>
        </div>
      )}
    </div>
  );
}

function SegmentCard({
  plan,
  segment,
  isNextToGenerate,
  busy,
  onGenerate,
  onTaskUpdate,
}: {
  plan: VideoSegment;
  segment: VideoSegmentResult | undefined;
  isNextToGenerate: boolean;
  busy: boolean;
  onGenerate: () => void | Promise<void>;
  onTaskUpdate: (task: VideoSegmentResult['videoTask']) => void;
}) {
  const t = useTranslations('workflow.storyboard.videoGen');
  const status = segment?.videoTask.status ?? (isNextToGenerate ? 'ready' : 'waiting');

  return (
    <article
      className={cn(
        'rounded-md border bg-card overflow-hidden',
        status === 'completed'
          ? 'border-green-300 dark:border-green-700/50'
          : status === 'failed'
            ? 'border-destructive/40'
            : 'border-border',
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-primary-foreground tabular-nums">
            {plan.seq}
          </span>
          <span className="text-sm font-medium">{t('segmentTitle', { seq: plan.seq })}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
            {plan.duration}s
          </span>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="space-y-3 p-4">
        {/* prompt 摘要 (折叠样式) */}
        <details className="rounded-md bg-muted/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            {t('viewPrompt')}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-foreground/80 leading-relaxed">
            {plan.prompt}
          </p>
        </details>

        {/* 首尾帧 + 视频区 */}
        {segment ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FrameThumb url={segment.firstFrameUrl} label={t('firstFrame')} />
              <FrameThumb url={segment.lastFrameUrl} label={t('lastFrame')} />
            </div>
            <VideoCard task={segment.videoTask} onChange={onTaskUpdate} />
          </>
        ) : isNextToGenerate ? (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">{t('readyHint')}</p>
            <Button
              onClick={() => void onGenerate()}
              disabled={busy}
              size="lg"
              className="mt-3 gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? t('generating') : t('generateNext', { seq: plan.seq })}
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
            {t('waitingPrev')}
          </div>
        )}

        {/* 段失败 → 重试按钮 */}
        {status === 'failed' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onGenerate()}
            disabled={busy}
            className="gap-1.5"
          >
            <RotateCw className="h-3.5 w-3.5" />
            {t('retrySegment')}
          </Button>
        )}
      </div>
    </article>
  );
}

function FrameThumb({ url, label }: { url: string; label: string }) {
  return (
    <figure className="space-y-1">
      <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="aspect-video w-full object-cover" />
      </div>
      <figcaption className="text-[10px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('workflow.storyboard.videoGen');
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: t('statusCompleted'), cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
    failed: { label: t('statusFailed'), cls: 'bg-destructive/10 text-destructive' },
    ready: { label: t('statusReady'), cls: 'bg-accent text-ink' },
    waiting: { label: t('statusWaiting'), cls: 'bg-muted text-muted-foreground' },
  };
  const entry = map[status] ?? { label: t('statusGenerating'), cls: 'bg-accent text-ink' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium', entry.cls)}>
      {entry.label}
    </span>
  );
}
