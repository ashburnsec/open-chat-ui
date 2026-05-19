'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDynamicCatalog, visibleModels } from '@/lib/dynamic-catalog';
import { filterChatModels } from '@/lib/chat-models';
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  findImageModel,
  resolveResolution,
  type AspectRatio,
  type ImageQuality,
  type Tier,
} from '@/lib/image-models';
import { cn } from '@/lib/utils';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EXTRA_REFS = 3;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

type ExtraRef = { dataUrl: string; sizeKb: number };

/**
 * M37 强化优化轮 (用户反馈):
 *  - 新加 planner 模型 selector (改写 prompt 用哪个 LLM, 默认沿用 conv 设置)
 *  - 多张额外参考图上传 (logo / 别的 ref), 这一轮的 batch 会把它们 append
 *    到 refs 数组送给 Gemini 生图模型. LLM 改写 prompt 时也能看到 (multimodal)
 *  - 持久化在 user message wizardState (per-round, 不污染 conv-level meta)
 */
export function StepOptimize({
  sourceUrl,
  sourcePrompt,
  iteration,
  defaultPlannerModel,
  defaultImageModel,
  defaultAspect,
  defaultTier,
  defaultQuality,
  onCancel,
  onSubmit,
  busy,
}: {
  sourceUrl: string;
  sourcePrompt: string;
  iteration: number;
  defaultPlannerModel: string;
  defaultImageModel: string;
  defaultAspect: AspectRatio;
  defaultTier: Tier;
  /** M41 follow-up²: gpt-image-2 才用. */
  defaultQuality?: ImageQuality;
  onCancel: () => void;
  onSubmit: (args: {
    newBrief: string;
    plannerModel: string;
    imageModel: string;
    aspectRatio: AspectRatio;
    tier: Tier;
    quality?: ImageQuality;
    extraRefDataUrls: string[];
  }) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations('workflow.imageGen.optimize');
  const tStep1 = useTranslations('workflow.imageGen.step1');
  const tHist = useTranslations('workflow.imageGen.history');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [brief, setBrief] = useState('');
  const [planner, setPlanner] = useState(defaultPlannerModel);
  const [extras, setExtras] = useState<ExtraRef[]>([]);
  // M37: 优化轮也允许换生图 model + aspect + tier (跟 Step 1 同款配置)
  const [image, setImage] = useState<string>(
    findImageModel(defaultImageModel)?.id ?? DEFAULT_IMAGE_MODEL,
  );
  const [aspect, setAspect] = useState<AspectRatio>(defaultAspect);
  const [t1, setTier] = useState<Tier>(defaultTier);
  const [quality, setQuality] = useState<ImageQuality | undefined>(defaultQuality);

  const dynamicCatalog = useDynamicCatalog();
  const chatModelOptions = useMemo(() => {
    if (!dynamicCatalog) return [] as string[];
    const ids = visibleModels(dynamicCatalog).map((m) => m.id);
    return filterChatModels(ids);
  }, [dynamicCatalog]);

  const currentModel = findImageModel(image);
  // 切 image model 时, 若当前 aspect/tier 不在新模型支持范围 → 重置到该模型默认
  useEffect(() => {
    if (!currentModel) return;
    if (!currentModel.aspects.includes(aspect)) setAspect(currentModel.defaultAspect);
    if (!currentModel.tiers.includes(t1)) setTier(currentModel.defaultTier);
    // M41 follow-up²: 切到 gpt-image-2 时初始化 quality
    if (currentModel.qualities && currentModel.qualities.length > 0) {
      if (!quality || !(currentModel.qualities as readonly string[]).includes(quality)) {
        setQuality(currentModel.defaultQuality ?? currentModel.qualities[0]);
      }
    } else {
      setQuality(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const preview = resolveResolution(aspect, t1);

  async function pickFiles(files: FileList) {
    const remaining = MAX_EXTRA_REFS - extras.length;
    if (remaining <= 0) {
      toast.error(tStep1('refLimitReached', { max: MAX_EXTRA_REFS }));
      return;
    }
    const accepted: ExtraRef[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (file.size > MAX_BYTES) {
        toast.error(tStep1('tooLarge'));
        continue;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(tStep1('notImage'));
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        accepted.push({ dataUrl, sizeKb: Math.round(file.size / 1024) });
      } catch {
        toast.error(tStep1('readFailed'));
      }
    }
    if (accepted.length > 0) setExtras((prev) => [...prev, ...accepted]);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5 space-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
          <span className="rounded-full bg-canvas-soft px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink">
            {tHist('iterationLabel', { n: iteration + 1 })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* 上轮选定图 + prompt */}
      <section className="mb-4 flex gap-4 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sourceUrl}
          alt="source"
          className="h-32 w-32 shrink-0 rounded-md object-cover ring-2 ring-ink/30"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('sourceLabel')}</p>
          <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
            {sourcePrompt}
          </p>
        </div>
      </section>

      {/* 改进要求 textarea */}
      <section className="mb-3 space-y-2 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <label className="text-xs font-medium text-muted-foreground">
          {t('improvementLabel')}
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          maxLength={400}
          placeholder={t('improvementPlaceholder')}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
        <p className="text-right text-[10px] text-muted-foreground">{brief.length}/400</p>
      </section>

      {/* M37: 改写 prompt 用的 LLM 模型选择 */}
      <section className="mb-3 space-y-1.5 rounded-md border border-border/60 bg-card/60 p-3">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {tStep1('plannerLabel')}
        </label>
        <select
          value={planner}
          onChange={(e) => setPlanner(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
        >
          {chatModelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground">{t('plannerHint')}</p>
      </section>

      {/* M37: 生图模型 + 比例 + 清晰度 (本轮可换) */}
      <section className="mb-3 space-y-3 rounded-md border border-border/60 bg-card/60 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tStep1('imageModelLabel')}
            </label>
            <select
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">{currentModel?.hint ?? ''}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tStep1('aspectLabel')}
            </label>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as AspectRatio)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
            >
              {(currentModel?.aspects ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        {currentModel && currentModel.tiers.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tStep1('tierLabel')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentModel.tiers.map((tt) => (
                <button
                  key={tt}
                  type="button"
                  onClick={() => setTier(tt)}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors',
                    tt === t1
                      ? 'border-ink bg-ink text-primary-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
                  )}
                >
                  {tt}
                </button>
              ))}
            </div>
            {/* M41 follow-up²: 4K 警告 — OpenAI 标 experimental, 可能拒某些 prompt */}
            {t1 === '4K' && (
              <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
                ⚠️ {tStep1('tier4kWarning')}
              </p>
            )}
          </div>
        )}
        {/* M41 follow-up²: quality picker — 仅 gpt-image-2 显示 */}
        {currentModel?.qualities && currentModel.qualities.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tStep1('qualityLabel')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentModel.qualities.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium capitalize transition-colors',
                    q === quality
                      ? 'border-ink bg-ink text-primary-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
                  )}
                  title={tStep1(`quality.${q}.hint`)}
                >
                  {tStep1(`quality.${q}.label`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
          <span>{tStep1('sizePreview')}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums text-foreground">
            {preview.w}×{preview.h}
          </span>
          <span>
            ({aspect}, {t1}{quality ? `, ${quality}` : ''})
          </span>
        </div>
      </section>

      {/* M37: 额外参考图 (logo / 其他 ref). 仅这一轮的 batch 加 */}
      <section className="mb-3 space-y-2 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            {t('extraRefsLabel', { current: extras.length, max: MAX_EXTRA_REFS })}
          </label>
          {extras.length > 0 && extras.length < MAX_EXTRA_REFS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs text-ink transition-colors hover:underline"
            >
              + {tStep1('addMoreRef')}
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">{t('extraRefsHint')}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void pickFiles(files);
            e.target.value = '';
          }}
        />
        {extras.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {extras.map((r, idx) => (
              <div
                key={idx}
                className="group relative aspect-square overflow-hidden rounded-md border border-border ring-1 ring-border/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.dataUrl} alt={`extra-${idx + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setExtras((prev) => prev.filter((_, i) => i !== idx))}
                  title={tStep1('remove')}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className="absolute bottom-1 left-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  +{idx + 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border/60 p-4',
              'text-muted-foreground transition-all hover:border-ink hover:bg-canvas-soft hover:text-ink',
            )}
          >
            <ImagePlus className="h-4 w-4" />
            <span className="text-xs">{tStep1('uploadHint')}</span>
            <span className="text-[10px]">{t('extraRefsHelp')}</span>
          </button>
        )}
      </section>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          <ArrowLeft className="h-4 w-4" />
          {t('cancel')}
        </Button>
        <Button
          onClick={() =>
            void onSubmit({
              newBrief: brief.trim(),
              plannerModel: planner,
              imageModel: image,
              aspectRatio: aspect,
              tier: t1,
              quality,
              extraRefDataUrls: extras.map((r) => r.dataUrl),
            })
          }
          disabled={busy || !brief.trim()}
          size="lg"
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('submit')}
          {!busy && <ArrowRight className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
