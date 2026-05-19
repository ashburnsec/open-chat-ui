'use client';

import { useTranslations } from 'next-intl';
import { Check, Edit3, Image as ImageIcon, Sparkles, Trophy } from 'lucide-react';
import type { WizardStep } from '@/lib/wizard-types';
import { cn } from '@/lib/utils';

type StepDef = {
  key: WizardStep;
  i18nKey: 'input' | 'directions' | 'prompts' | 'results' | 'done';
  icon: React.ComponentType<{ className?: string }>;
};

const STEP_DEFS: ReadonlyArray<StepDef> = [
  { key: 'input', i18nKey: 'input', icon: Edit3 },
  { key: 'directions', i18nKey: 'directions', icon: Sparkles },
  { key: 'prompts', i18nKey: 'prompts', icon: ImageIcon },
  { key: 'results', i18nKey: 'results', icon: Sparkles },
  { key: 'done', i18nKey: 'done', icon: Trophy },
];

const STEP_ORDER: WizardStep[] = [
  'input',
  'directions',
  'prompts',
  'prompt_review',
  'results',
  'optimizing',
  'done',
  'video_plan',
  'video_gen',
];

function progressIdx(step: WizardStep): number {
  // optimizing 视觉上跟 results 同级 (循环阶段)
  if (step === 'optimizing') return STEP_ORDER.indexOf('results');
  // M42-S4: storyboard prompt_review 视觉对齐 'prompts'.
  if (step === 'prompt_review') return STEP_ORDER.indexOf('prompts');
  // M42-S5: storyboard 续步 video_plan / video_gen 视觉对齐 'done' (分镜
  // 图阶段已结束, 进度条不再延展; 视频续步内部自管 N 段进度).
  if (step === 'video_plan' || step === 'video_gen') return STEP_ORDER.indexOf('done');
  const idx = STEP_ORDER.indexOf(step);
  // 未知 step 兜底到 'done' 索引, 不返回 -1 让上层访问 STEP_DEFS[-1] 崩.
  return idx >= 0 ? idx : STEP_ORDER.indexOf('done');
}

/**
 * M36 wizard 进度条 — 5 段连接式 stepper, 当前段 ring + pulse, 已完成段
 * 渐变 fill, 未到段灰色. mobile 只显示当前 step + 数字.
 *
 * M37: 已完成段可点击跳回 (onJumpTo). 跳回不丢历史 — 用户能再前进, 新轮
 * 编号继续递增. 'optimizing' 视觉同 'results', 不出现在跳回菜单里.
 */
export function WizardProgressBar({
  step,
  onJumpTo,
}: {
  step: WizardStep;
  onJumpTo?: (target: WizardStep) => void;
}) {
  const t = useTranslations('workflow.imageGen.steps');
  const cur = progressIdx(step);
  const total = STEP_DEFS.length;
  const curLabel = t(STEP_DEFS[Math.min(cur, total - 1)]!.i18nKey);
  return (
    <div className="px-3 py-3 sm:px-4">
      {/* Mobile: compact label */}
      <div className="flex items-center justify-between text-xs sm:hidden">
        <span className="font-medium text-foreground">
          {Math.min(cur + 1, total)} / {total} · {curLabel}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {Math.round(((cur + 1) / total) * 100)}%
        </span>
      </div>
      {/* Desktop: full stepper */}
      <ol className="hidden items-center gap-1 sm:flex">
        {STEP_DEFS.map((s, i) => {
          const Icon = s.icon;
          const done = i < cur || step === 'done';
          const active = i === cur && step !== 'done';
          // M37: 已完成段可点击跳回 (active / 未到段不可)
          const clickable = done && onJumpTo != null && s.key !== step;
          const Wrapper = clickable ? 'button' : 'div';
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1.5">
              <Wrapper
                {...(clickable
                  ? {
                      type: 'button' as const,
                      onClick: () => onJumpTo!(s.key),
                      title: t('jumpBack', { name: t(s.i18nKey) }),
                    }
                  : {})}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                  done && 'bg-ink text-primary-foreground',
                  active &&
                    'bg-accent text-ink ring-2 ring-ink/30 [animation:wizard-pulse_2s_ease-in-out_infinite]',
                  !done && !active && 'bg-muted text-muted-foreground',
                  clickable && 'hover:bg-canvas-soft cursor-pointer',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </Wrapper>
              <span
                className={cn(
                  'text-xs',
                  done || active ? 'font-medium text-foreground' : 'text-muted-foreground',
                  clickable && 'cursor-pointer hover:underline',
                )}
                onClick={clickable ? () => onJumpTo!(s.key) : undefined}
              >
                {t(s.i18nKey)}
              </span>
              {i < total - 1 && (
                <div
                  className={cn(
                    'mx-1 h-px flex-1 transition-colors',
                    done ? 'bg-canvas-soft' : 'bg-border',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
