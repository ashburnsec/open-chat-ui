'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Film, ImageIcon, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VideoSegment } from '@/lib/wizard-types';

/**
 * M42-S5 PR-A · storyboard mini-app 续步: 视频段落规划审查.
 *
 * LLM 已经读分镜图输出 N 段规划 (each: prompt + first_frame_desc +
 * last_frame_desc + duration). 这个组件让用户审查 / 编辑 / 重新规划 /
 * 确认开始生成. 段间衔接已经在服务端强制段 N+1 first_frame = 段 N
 * last_frame, 这里编辑 last_frame 时联动更新下一段 first_frame.
 *
 * UX:
 *  - 顶部分镜图缩略 + 段数 + 总时长 + 预估成本 chip
 *  - 每段卡片 (折叠展开): 时长 cycle / prompt textarea / 首尾帧描述
 *  - 底部「↻ 重新规划」+「开始生成」按钮
 *
 * 提交后调 PR-B 的 step='video_segment', 但 PR-A 阶段先 toast 占位.
 */

const PRICE_PER_SEC_USD = 0.4; // Veo 3.1 1080p ~$0.4/s, 4K $0.6/s
const IMAGE_PRICE_USD = 0.04; // Gemini Nano Banana 系单张

export function StepStoryboardVideoPlan({
  initialPlan,
  finalUrl,
  plannerModel,
  busy,
  onRegenerate,
  onConfirm,
}: {
  initialPlan: VideoSegment[];
  /** 最终分镜图 URL (用作 ref 图给后续 PR-B 出首尾帧 + Veo). */
  finalUrl: string | null;
  /** 显示在 UI 上的 LLM 模型名. */
  plannerModel: string;
  busy: boolean;
  /** 用户点「重新规划」— 调 server step='video_plan' 重出一份. */
  onRegenerate: () => void | Promise<void>;
  /** 用户点「开始生成」— 父开始 PR-B 流程. */
  onConfirm: (plan: VideoSegment[]) => void | Promise<void>;
}) {
  const t = useTranslations('workflow.storyboard.videoPlan');
  const [plan, setPlan] = useState<VideoSegment[]>(initialPlan);

  /** 编辑某段时维持段间衔接: 改 segment[i].last_frame 时同步 segment[i+1].first_frame. */
  function updateSegment(idx: number, patch: Partial<VideoSegment>) {
    setPlan((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      if (patch.last_frame_desc !== undefined && idx + 1 < next.length) {
        next[idx + 1] = {
          ...next[idx + 1]!,
          first_frame_desc: patch.last_frame_desc!,
        };
      }
      return next;
    });
  }

  const totalDuration = useMemo(() => plan.reduce((a, s) => a + s.duration, 0), [plan]);
  // 成本: 首段需要 2 张图 (首+尾), 后续每段 1 张 (复用上段尾帧) + Veo 视频费.
  const estCost = useMemo(() => {
    if (plan.length === 0) return 0;
    const imageCount = 1 + plan.length; // 段 1 出 2 张, 其余各 1 张 = N+1
    const videoSec = totalDuration;
    return imageCount * IMAGE_PRICE_USD + videoSec * PRICE_PER_SEC_USD;
  }, [plan, totalDuration]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Film className="h-5 w-5 text-ink" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* 顶部摘要: 分镜图 + 关键指标 */}
      <section className="flex items-start gap-4 rounded-md border border-border bg-card p-4">
        {finalUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={finalUrl}
            alt={t('refImageAlt')}
            className="h-32 w-24 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div className="flex-1 space-y-2">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <SummaryStat label={t('segmentCount')} value={String(plan.length)} unit={t('segmentUnit')} />
            <SummaryStat label={t('totalDuration')} value={String(totalDuration)} unit="s" />
            <SummaryStat label={t('estCost')} value={`$${estCost.toFixed(2)}`} unit={t('usd')} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('summaryHint', { model: plannerModel })}
          </p>
        </div>
      </section>

      {/* 段卡片列表 */}
      <div className="space-y-3">
        {plan.map((segment, idx) => (
          <SegmentCard
            key={segment.seq}
            segment={segment}
            isFirst={idx === 0}
            onChange={(patch) => updateSegment(idx, patch)}
          />
        ))}
      </div>

      {/* 底部按钮 */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          onClick={() => void onRegenerate()}
          disabled={busy}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {t('regenerate')}
        </Button>
        <Button
          onClick={() => void onConfirm(plan)}
          disabled={busy || plan.length === 0}
          size="lg"
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {t('confirm', { cost: estCost.toFixed(2) })}
        </Button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function SegmentCard({
  segment,
  isFirst,
  onChange,
}: {
  segment: VideoSegment;
  /** 段 1 的 first_frame_desc 可独立编辑; 后续段是被上一段 last_frame 覆盖, 显只读. */
  isFirst: boolean;
  onChange: (patch: Partial<VideoSegment>) => void;
}) {
  const t = useTranslations('workflow.storyboard.videoPlan');
  const [expanded, setExpanded] = useState(true);
  const durations: ReadonlyArray<4 | 6 | 8> = [4, 6, 8];

  return (
    <article className="rounded-md border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-primary-foreground tabular-nums">
            {segment.seq}
          </span>
          <span className="text-sm font-medium">
            {t('segmentTitle', { seq: segment.seq })}
          </span>
          <button
            type="button"
            onClick={() => {
              const idx = durations.indexOf(segment.duration);
              const next = durations[(idx + 1) % durations.length]!;
              onChange({ duration: next });
            }}
            className={cn(
              'ml-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors',
              'bg-accent text-ink hover:bg-accent/80',
            )}
            title={t('durationTooltip')}
          >
            {segment.duration}s
          </button>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? t('collapse') : t('expand')}
        </button>
      </header>

      {expanded && (
        <div className="space-y-3 p-4">
          <Field label={t('promptLabel')} hint={t('promptHint')}>
            <textarea
              value={segment.prompt}
              onChange={(e) => onChange({ prompt: e.target.value })}
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t('firstFrameLabel')}
                  {!isFirst && (
                    <span className="text-[10px] text-muted-foreground">
                      ({t('linkedFromPrev')})
                    </span>
                  )}
                </span>
              }
              hint={isFirst ? t('firstFrameHint') : t('firstFrameLinkedHint')}
            >
              <textarea
                value={segment.first_frame_desc}
                onChange={(e) => onChange({ first_frame_desc: e.target.value })}
                rows={3}
                disabled={!isFirst}
                className={cn(
                  'w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed focus:border-ink focus:outline-none',
                  !isFirst && 'cursor-not-allowed bg-muted/40 text-muted-foreground',
                )}
              />
            </Field>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t('lastFrameLabel')}
                </span>
              }
              hint={t('lastFrameHint')}
            >
              <textarea
                value={segment.last_frame_desc}
                onChange={(e) => onChange({ last_frame_desc: e.target.value })}
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed focus:border-ink focus:outline-none"
              />
            </Field>
          </div>
        </div>
      )}
    </article>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] leading-relaxed text-muted-foreground/80">{hint}</p>}
    </div>
  );
}
