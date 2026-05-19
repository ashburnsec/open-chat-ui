'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * M36 补漏 · 生图过程中的占位 grid. WizardCanvas 在 generateBatch 飞行
 * 中替换主区视图: 原本 StepPromptsReview / StepOptimize 的 spinner 只
 * 在按钮上, 用户不知道几张在生 / 哪张快好了. 这里直接渲染 N 个
 * aspect-square 占位卡 + spinner + "[Image #N] 生成中" 标签, 给用户
 * 视觉反馈.
 *
 * 注: 上游 Vertex Gemini 全部并发跑, 没有逐张进度信号 — 这个组件单
 * 纯占位, 不显示真实"完成 1/4 / 2/4". 如果未来上游支持流式, 这里替换
 * 成真进度即可.
 */
export type GeneratingPhase = 'rewriting_prompts' | 'generating_images';

export function GeneratingPlaceholder({
  count,
  iteration,
  retrying = false,
  phase = 'generating_images',
  imageModel,
}: {
  count: number;
  iteration: number;
  /** 上游 429 等错误正在退避重试时, hint 文案不一样. */
  retrying?: boolean;
  /** M37: 优化轮分两阶段 — LLM 改写 prompt → 图像生成. 用户能区分进度. */
  phase?: GeneratingPhase;
  /** M42-S4: 按模型切 hint 文案. gpt-image-2 单张 2-3 分钟, 让用户知道
   *  等待时间; 其他模型 (Gemini Nano Banana 系) 仍 5-15 秒. */
  imageModel?: string;
}) {
  const t = useTranslations('workflow.imageGen.generating');
  const tHist = useTranslations('workflow.imageGen.history');
  const isRewriting = phase === 'rewriting_prompts';
  const isGptImage2 = imageModel === 'gpt-image-2';
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 space-y-1">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-ink" />
          <h2 className="text-lg font-semibold tracking-tight">
            {isRewriting ? t('rewritingTitle') : t('title', { n: count })}
          </h2>
          <span className="rounded-full bg-canvas-soft px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink">
            {tHist('iterationLabel', { n: iteration })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {isRewriting
            ? t('rewritingHint')
            : retrying
              ? t('retryingHint')
              : isGptImage2
                ? t('hintGptImage2')
                : t('hint')}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, idx) => (
          <PlaceholderCard key={idx} idx={idx + 1} dimmed={isRewriting} />
        ))}
      </div>
    </div>
  );
}

function PlaceholderCard({ idx, dimmed = false }: { idx: number; dimmed?: boolean }) {
  const t = useTranslations('workflow.imageGen.generating');
  return (
    <figure
      className={cn(
        'group relative flex aspect-square flex-col items-center justify-center gap-3 overflow-hidden rounded-md',
        'border border-border/60 bg-gradient-to-br from-muted/40 via-card to-muted/30',
        '[animation:wizard-pulse_2s_ease-in-out_infinite]',
        dimmed && 'opacity-50', // 改写 prompt 阶段图片占位淡一点, 视觉传达"还没到生图"
      )}
      style={{ animationDelay: `${idx * 80}ms` }}
    >
      <Loader2 className="h-8 w-8 animate-spin text-ink/70" />
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-xs font-medium text-foreground tabular-nums">
          [Image #{idx}]
        </span>
        <span className="text-[11px] text-muted-foreground">
          {dimmed ? t('cellWaiting') : t('cellLabel')}
        </span>
      </div>
    </figure>
  );
}
