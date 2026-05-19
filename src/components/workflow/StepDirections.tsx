'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Camera, Lightbulb, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Direction } from '@/lib/wizard-types';
import { cn } from '@/lib/utils';

/**
 * M36 wizard step 2 — AI 给的 4-5 个方向卡片. 用户点一个 → 直接进 step 3
 * (不是多轮对话, 一次性输出 + 点击决策).
 *
 * 卡片视觉: rounded-md + shadow + hover lift + 渐变 backdrop. 4 维度
 * (scene/lighting/pose/mood) 用 icon 标识 + 短摘要. stagger 入场动画.
 */
export function StepDirections({
  directions,
  onPick,
  onRegenerate,
  busy,
}: {
  directions: Direction[];
  onPick: (idx: number, direction: Direction) => Promise<void>;
  onRegenerate: () => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations('workflow.imageGen.directions');
  const [pickingIdx, setPickingIdx] = useState<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { n: directions.length })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onRegenerate()}
          disabled={busy}
          className="shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {busy ? t('regenerating') : t('regenerate')}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {directions.map((d, idx) => {
          const picking = pickingIdx === idx;
          return (
            <button
              key={`${idx}-${d.title}`}
              type="button"
              disabled={busy}
              onClick={async () => {
                setPickingIdx(idx);
                try {
                  await onPick(idx, d);
                } finally {
                  setPickingIdx(null);
                }
              }}
              style={{ animationDelay: `${idx * 60}ms` }}
              className={cn(
                'group relative overflow-hidden rounded-md border border-border bg-card p-4 text-left',
                'transition-colors duration-150',
                'hover:border-ink hover:bg-accent/40',
                'disabled:opacity-60',
                'opacity-0 [animation:wizard-card-pop_0.4s_ease-out_both]',
                picking && 'ring-2 ring-ink/30',
              )}
            >
              {/* Hero gradient overlay */}
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 opacity-0 transition-opacity',
                  'bg-gradient-to-br from-primary/10 via-transparent to-accent/10',
                  'group-hover:opacity-100',
                )}
              />
              <div className="relative space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-semibold leading-tight">{d.title}</h3>
                  <span className="shrink-0 rounded-full bg-canvas-soft px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink">
                    #{idx + 1}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{d.summary}</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-1.5">
                    <Camera className="mt-0.5 h-3 w-3 shrink-0 text-ink/70" />
                    <span className="line-clamp-2">
                      <span className="text-foreground">场景：</span>
                      {d.scene}
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-ink/70" />
                    <span className="line-clamp-1">
                      <span className="text-foreground">光线：</span>
                      {d.lighting}
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Wand2 className="mt-0.5 h-3 w-3 shrink-0 text-ink/70" />
                    <span className="line-clamp-1">
                      <span className="text-foreground">氛围：</span>
                      {d.mood}
                    </span>
                  </li>
                </ul>
                <div className="flex items-center justify-end gap-1 text-xs font-medium text-ink opacity-60 transition-opacity group-hover:opacity-100">
                  {picking ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      生成 Prompt
                    </>
                  ) : (
                    <>
                      选择此方向
                      <ArrowRight className="h-3 w-3" />
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
