'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  ImagePlus,
  Loader2,
  Pin,
  Sparkles,
  ShoppingBag,
  X,
} from 'lucide-react';
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
import type { UseCase } from '@/lib/wizard-types';
import { cn } from '@/lib/utils';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REFS = 4;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

type RefImage = { dataUrl: string; mime: string; sizeKb: number };

/**
 * M37 wizard step 1 — 输入需求.
 *   • 上传 1-4 张参考图 (M37 多 ref 支持)
 *   • 多行 brief
 *   • 用途 selector (通用 / 电商), 切电商时默认 1:1 / 2K + 自动勾垫图模式
 *   • 垫图 toggle (产品主体严格一致, 解决用户反馈"4 张里只 1 张能用")
 *   • 模型 / aspect / tier 选择器 (M36 补漏)
 */
export function StepInputV2({
  initialBrief,
  initialRefImageUrls,
  plannerModel,
  imageModel,
  aspectRatio,
  tier,
  quality: initialQuality,
  useCase: initialUseCase,
  pinSubject: initialPinSubject,
  bilingualPrompts: initialBilingual,
  onSubmit,
  busy,
}: {
  initialBrief: string;
  initialRefImageUrls: string[];
  plannerModel: string;
  imageModel: string;
  aspectRatio: AspectRatio;
  tier: Tier;
  /** M41 follow-up: gpt-image-2 才用. */
  quality?: ImageQuality;
  useCase: UseCase;
  pinSubject: boolean;
  bilingualPrompts: boolean;
  onSubmit: (args: {
    brief: string;
    refImageDataUrls: string[];
    plannerModel: string;
    imageModel: string;
    aspectRatio: AspectRatio;
    tier: Tier;
    quality?: ImageQuality;
    useCase: UseCase;
    pinSubject: boolean;
    bilingualPrompts: boolean;
  }) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations('workflow.imageGen.step1');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [brief, setBrief] = useState(initialBrief);
  const [refs, setRefs] = useState<RefImage[]>(
    initialRefImageUrls.map((u) => ({ dataUrl: u, mime: 'image/png', sizeKb: 0 })),
  );
  const [planner, setPlanner] = useState(plannerModel);
  const [image, setImage] = useState<string>(
    findImageModel(imageModel)?.id ?? DEFAULT_IMAGE_MODEL,
  );
  const [aspect, setAspect] = useState<AspectRatio>(aspectRatio);
  const [t1, setTier] = useState<Tier>(tier);
  const [quality, setQuality] = useState<ImageQuality | undefined>(initialQuality);
  const [showMoreAspects, setShowMoreAspects] = useState(false);
  // M42-S2 follow-up: setUseCase 砍了 — 三 mini-app 拆分后 use_case 由
  // MiniAppsPanel 创建 conv 时锁定, Step 1 不允许切. 但保留 useState 让
  // ecommerce mode 切 aspect/tier/pinSubject 的副作用 useEffect 仍能跑.
  const [useCase] = useState<UseCase>(initialUseCase);
  const [pinSubject, setPinSubject] = useState<boolean>(initialPinSubject);
  const [bilingualPrompts, setBilingualPrompts] = useState<boolean>(initialBilingual);

  const dynamicCatalog = useDynamicCatalog();
  const chatModelOptions = useMemo(() => {
    if (!dynamicCatalog) return [] as string[];
    const ids = visibleModels(dynamicCatalog).map((m) => m.id);
    return filterChatModels(ids);
  }, [dynamicCatalog]);

  // Make sure planner model is within available chat models
  useEffect(() => {
    if (chatModelOptions.length === 0) return;
    if (!chatModelOptions.includes(planner)) {
      setPlanner(chatModelOptions.includes('gpt-5.5') ? 'gpt-5.5' : chatModelOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatModelOptions]);

  // 切 image model 时, 若当前 aspect/tier 不在新模型支持范围 → 重置.
  const currentModel = findImageModel(image);
  useEffect(() => {
    if (!currentModel) return;
    if (!currentModel.aspects.includes(aspect)) {
      setAspect(currentModel.defaultAspect);
    }
    if (!currentModel.tiers.includes(t1)) {
      setTier(currentModel.defaultTier);
    }
    // M41 follow-up: 切到 gpt-image-2 时初始化 quality, 否则 unset
    if (currentModel.qualities && currentModel.qualities.length > 0) {
      if (!quality || !(currentModel.qualities as readonly string[]).includes(quality)) {
        setQuality(currentModel.defaultQuality ?? currentModel.qualities[0]);
      }
    } else {
      setQuality(undefined);
    }
    setShowMoreAspects(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // M37: 切电商模式时, 默认 aspect=1:1 + tier=2K (Pro) / 1K (Banana 1) + 勾上垫图模式
  // (用户反馈: 电商场景"产品主体不能动"是核心诉求).
  useEffect(() => {
    if (useCase !== 'ecommerce' || !currentModel) return;
    if (currentModel.aspects.includes('1:1')) setAspect('1:1');
    const preferred: Tier = currentModel.tiers.includes('2K') ? '2K' : currentModel.defaultTier;
    setTier(preferred);
    if (refs.length > 0) setPinSubject(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCase]);

  const popular = currentModel?.popularAspects ?? [];
  const more = currentModel
    ? currentModel.aspects.filter((a) => !popular.includes(a))
    : [];
  const showAspectMore = more.length > 0;
  const preview = resolveResolution(aspect, t1);

  async function pickFiles(files: FileList) {
    const remaining = MAX_REFS - refs.length;
    if (remaining <= 0) {
      toast.error(t('refLimitReached', { max: MAX_REFS }));
      return;
    }
    const accepted: RefImage[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (file.size > MAX_BYTES) {
        toast.error(t('tooLarge'));
        continue;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(t('notImage'));
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        accepted.push({
          dataUrl,
          mime: file.type || 'image/png',
          sizeKb: Math.round(file.size / 1024),
        });
      } catch {
        toast.error(t('readFailed'));
      }
    }
    if (accepted.length > 0) setRefs((prev) => [...prev, ...accepted]);
  }

  const canSubmit = !busy && brief.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* M42-S2 follow-up: 三 mini-app 拆分后, use_case 由 MiniAppsPanel
       *  创建 conv 时锁定, 不再让用户在 Step 1 切. 这里只显示当前模式 chip
       *  + 该模式的提示 (电商保留 6 类标准图 chip 预览, 帮用户预知方向). */}
      <section className="space-y-2 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('useCaseLabel')}</span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-xs font-medium text-ink">
            {useCase === 'storyboard' ? (
              <Clapperboard className="h-3.5 w-3.5" />
            ) : useCase === 'ecommerce' ? (
              <ShoppingBag className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{t(`useCase.${useCase}.title`)}</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t(`useCase.${useCase}.hint`)}</p>
        {/* M41 D1: 电商模式展示 6 类标准图 chip 预览, 让用户先知道方向卡的样子 */}
        {useCase === 'ecommerce' && (
          <div className="mt-2 rounded-lg border border-ink bg-accent/40 p-3">
            <p className="mb-2 text-xs font-medium text-ink">
              {t('useCase.ecommerce.previewLabel')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(['whiteBg', 'feature', 'scene', 'model', 'mood', 'ratio'] as const).map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-[11px] text-foreground"
                >
                  {t(`useCase.ecommerce.categories.${key}`)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t('useCase.ecommerce.previewHint')}
            </p>
          </div>
        )}
      </section>

      {/* M37: 多 ref 图 (最多 4 张) + 垫图模式 toggle */}
      <section className="space-y-3 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            {t('refImagesLabel', { current: refs.length, max: MAX_REFS })}
          </label>
          {refs.length > 0 && refs.length < MAX_REFS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs text-ink transition-colors hover:underline"
            >
              + {t('addMoreRef')}
            </button>
          )}
        </div>
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
        {refs.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-4">
            {refs.map((r, idx) => (
              <div
                key={idx}
                className="group relative aspect-square overflow-hidden rounded-md border border-border ring-1 ring-border/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.dataUrl} alt={`ref-${idx + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setRefs((prev) => prev.filter((_, i) => i !== idx))}
                  title={t('remove')}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className="absolute bottom-1 left-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  #{idx + 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border/60 p-6',
              'text-muted-foreground transition-all hover:border-ink hover:bg-canvas-soft hover:text-ink',
            )}
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-sm">{t('uploadHint')}</span>
            <span className="text-xs">{t('uploadFormats')}</span>
          </button>
        )}

        {/* M37: 垫图模式 toggle. M42-S4: 仅 ecommerce 显 (产品主体严格一致
         *  是电商专属诉求 — free/storyboard 都不需要). */}
        {useCase === 'ecommerce' && (
          <button
            type="button"
            onClick={() => refs.length > 0 && setPinSubject((v) => !v)}
            disabled={refs.length === 0}
            className={cn(
              'flex w-full items-start gap-3 rounded-md border p-3 text-left text-xs transition-colors',
              pinSubject
                ? 'border-ink bg-canvas-soft text-foreground'
                : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <div
              className={cn(
                'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                pinSubject ? 'border-ink bg-ink text-primary-foreground' : 'border-border',
              )}
            >
              {pinSubject && <Pin className="h-2.5 w-2.5" />}
            </div>
            <div className="flex-1 space-y-0.5">
              <span className="block font-medium">{t('pinSubject.label')}</span>
              <span className="block text-[11px] leading-relaxed">{t('pinSubject.hint')}</span>
            </div>
          </button>
        )}
      </section>

      {/* Brief textarea */}
      <section className="space-y-2 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <label className="text-xs font-medium text-muted-foreground">{t('needsLabel')}</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder={t('needsPlaceholder')}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
        <p className="text-right text-[10px] text-muted-foreground">{brief.length}/500</p>
      </section>

      {/* 模型选择: 讨论 + 生图 */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-md border border-border/60 bg-card/60 p-3">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('plannerLabel')}
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
        </div>
        <div className="space-y-1.5 rounded-md border border-border/60 bg-card/60 p-3">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('imageModelLabel')}
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
      </section>

      {/* Aspect 按钮组 + Tier chips - 两级 resolution UI */}
      <section className="space-y-3 rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('aspectLabel')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {popular.map((a) => (
              <AspectButton
                key={a}
                value={a}
                active={a === aspect}
                onClick={() => setAspect(a)}
              />
            ))}
            {showAspectMore && (
              <button
                type="button"
                onClick={() => setShowMoreAspects((v) => !v)}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-md border border-border/60 px-2.5 text-xs',
                  'text-muted-foreground transition-colors hover:border-ink hover:text-foreground',
                )}
              >
                {showMoreAspects ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> {t('aspectCollapse')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" /> {t('aspectMore')} ({more.length})
                  </>
                )}
              </button>
            )}
          </div>
          {showMoreAspects && more.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {more.map((a) => (
                <AspectButton
                  key={a}
                  value={a}
                  active={a === aspect}
                  onClick={() => setAspect(a)}
                />
              ))}
            </div>
          )}
        </div>

        {currentModel && currentModel.tiers.length > 1 && (
          <div className="space-y-2">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('tierLabel')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentModel.tiers.map((tt) => (
                <button
                  key={tt}
                  type="button"
                  onClick={() => setTier(tt)}
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium tabular-nums transition-colors',
                    tt === t1
                      ? 'border-ink bg-ink text-primary-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
                  )}
                >
                  {tt}
                </button>
              ))}
            </div>
            {/* M41 follow-up²: 4K 警告 */}
            {t1 === '4K' && (
              <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
                ⚠️ {t('tier4kWarning')}
              </p>
            )}
          </div>
        )}

        {/* M41 follow-up: quality picker — 仅 gpt-image-2 显示 (OpenAI 三档质量) */}
        {currentModel?.qualities && currentModel.qualities.length > 0 && (
          <div className="space-y-2">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('qualityLabel')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentModel.qualities.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium capitalize transition-colors',
                    q === quality
                      ? 'border-ink bg-ink text-primary-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
                  )}
                  title={t(`quality.${q}.hint`)}
                >
                  {t(`quality.${q}.label`)}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t('qualityHint')}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
          <span>{t('sizePreview')}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums text-foreground">
            {preview.w}×{preview.h}
          </span>
          <span>
            ({aspect}, {t1}{quality ? `, ${quality}` : ''})
          </span>
        </div>
      </section>

      {/* M37: bilingual prompts 开关. M42-S4: storyboard 自己有 prompt
          review 步骤切语言, 这里不需要; 仅 free/ecommerce 显示. */}
      {useCase !== 'storyboard' && (
        <button
          type="button"
          onClick={() => setBilingualPrompts((v) => !v)}
          className={cn(
            'flex items-center gap-2 self-start rounded-md border px-3 py-1.5 text-xs transition-colors',
            bilingualPrompts
              ? 'border-ink bg-canvas-soft text-foreground'
              : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
          )}
        >
          <span
            className={cn(
              'inline-flex h-3.5 w-3.5 items-center justify-center rounded border',
              bilingualPrompts ? 'border-ink bg-ink' : 'border-border',
            )}
          >
            {bilingualPrompts && <Check className="h-2 w-2 text-primary-foreground" />}
          </span>
          {t('bilingual.label')}
        </button>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() =>
            void onSubmit({
              brief: brief.trim(),
              refImageDataUrls: refs.map((r) => r.dataUrl),
              plannerModel: planner,
              imageModel: image,
              aspectRatio: aspect,
              tier: t1,
              quality,
              useCase,
              pinSubject,
              bilingualPrompts,
            })
          }
          disabled={!canSubmit}
          size="lg"
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {busy
            ? t('submitting')
            : useCase === 'storyboard'
              ? t('submitStoryboard')
              : t('submit')}
        </Button>
      </div>
    </div>
  );
}

function UseCaseCard({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 text-left text-xs transition-colors duration-150',
        active
          ? 'border-ink bg-accent ring-2 ring-ink/30'
          : 'border-border hover:border-ink',
      )}
    >
      <div
        className={cn(
          'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          active
            ? 'bg-ink text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <div className="flex-1 space-y-0.5">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-[11px] leading-relaxed text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

function AspectButton({
  value,
  active,
  onClick,
}: {
  value: AspectRatio;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors',
        active
          ? 'border-ink bg-ink text-primary-foreground'
          : 'border-border/60 text-muted-foreground hover:border-ink hover:text-foreground',
      )}
    >
      {value}
    </button>
  );
}
