'use client';

import { useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { WizardProgressBar } from '@/components/workflow/WizardProgressBar';
import { WizardHistory } from '@/components/workflow/WizardHistory';
import { StepInputV2 } from '@/components/workflow/StepInputV2';
import { StepDirections } from '@/components/workflow/StepDirections';
import { StepPromptsReview } from '@/components/workflow/StepPromptsReview';
import { StepResultsV2 } from '@/components/workflow/StepResultsV2';
import { StepOptimize } from '@/components/workflow/StepOptimize';
import { StepDone } from '@/components/workflow/StepDone';
import { StepStoryboardPromptReview } from '@/components/workflow/StepStoryboardPromptReview';
import { StepStoryboardVideoPlan } from '@/components/workflow/StepStoryboardVideoPlan';
import { StepStoryboardVideoGen } from '@/components/workflow/StepStoryboardVideoGen';
import type { VideoSegment, VideoSegmentResult } from '@/lib/wizard-types';
import { GeneratingPlaceholder } from '@/components/workflow/GeneratingPlaceholder';
import { hydrateWizardState } from '@/lib/wizard-hydrate';
import { wizardReducer } from '@/lib/wizard-reducer';
import { findImageModel, DEFAULT_IMAGE_MODEL } from '@/lib/image-models';
import type {
  Direction,
  Iteration,
  IterationResult,
  WizardMetadata,
  WizardState,
  WizardStep,
} from '@/lib/wizard-types';
import type { AspectRatio, Tier } from '@/lib/image-models';

/**
 * M36 一键生图 mini-app 主区. /(chat)/c/[id]/page.tsx 检测
 * conv.wizardMetadata.kind === 'image-gen' 后渲染这个组件 (而非
 * ChatPanel). sidebar / TopNav 仍是 (chat)/layout 提供.
 *
 * 状态管理: useReducer + 服务端持久化. 每个 step 完成时调
 * /v1/conversations/:id/wizard/step (经 BFF /api/conv/...), 拿到新
 * message + 更新后的 metadata 后 dispatch reducer action 推进 UI.
 *
 * 5 阶段: input → directions → prompts → results → (optimizing 循环)
 * → done. WizardHistory 在主区上方显示已完成的所有迭代轮次.
 */
type RawConv = {
  id: string;
  wizardMetadata?: WizardMetadata | null;
  wizard_metadata?: WizardMetadata | null;
};

type RawMessage = {
  id: number;
  role: string;
  content: Record<string, unknown> | null;
};

type StepResp = {
  success: boolean;
  message?: string;
  data?: { message: RawMessage; metadata: WizardMetadata };
};

export function WizardCanvas({
  conversation,
  initialMessages,
}: {
  conversation: RawConv;
  initialMessages: RawMessage[];
}) {
  const router = useRouter();
  const tErr = useTranslations('workflow.imageGen.errors');
  const [state, dispatch] = useReducer(
    wizardReducer,
    null,
    () => hydrateWizardState(conversation, initialMessages),
  );
  const [busy, setBusy] = useState(false);
  // step=optimizing 时我们用临时 state 记录"上轮选定的图"
  const [optimizeSource, setOptimizeSource] = useState<{
    url: string;
    prompt: string;
  } | null>(null);
  // M36 补漏: 历史轮次 inline edit prompts → fork. 有值时 step 视图渲
  // 染 StepPromptsReview, 用这一组 prompts (而非 state.prompts), 并把
  // forked_from 传给 generateBatch.
  const [editingIter, setEditingIter] = useState<{
    iteration: number;
    prompts: string[];
  } | null>(null);
  // M36 补漏: generateBatch 飞行中显示 N 张占位 grid + spinner. 上游 429
  // 重试时切到 retrying 文案 (server 会重试 2 次, 总用时最多 ~25s).
  // M37: phase 区分改写 prompt 跟 image gen 两个阶段, 用户能感知到两步.
  const [generating, setGenerating] = useState<{
    count: number;
    phase: 'rewriting_prompts' | 'generating_images';
  } | null>(null);

  const step: WizardStep = editingIter
    ? 'prompts'
    : optimizeSource
      ? 'optimizing'
      : state.metadata.step;
  const currentIteration =
    state.iterations.length > 0
      ? state.iterations[state.iterations.length - 1]
      : null;

  async function callStep<T = unknown>(
    body: Record<string, unknown>,
  ): Promise<{ message: RawMessage; metadata: WizardMetadata } | null> {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/conv/v1/conversations/${conversation.id}/wizard/step`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const j = (await r.json()) as StepResp;
      if (!j.success || !j.data) {
        toast.error(j.message ?? tErr('callFailed'));
        return null;
      }
      // refresh server state so /history sidebar / count gets updated
      router.refresh();
      return j.data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tErr('networkError'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ---------- step handlers ----------

  async function submitInput(args: {
    brief: string;
    refImageDataUrls: string[];
    plannerModel: string;
    imageModel: string;
    aspectRatio: AspectRatio;
    tier: Tier;
    quality?: 'low' | 'medium' | 'high';
    useCase: 'free' | 'ecommerce' | 'poster' | 'storyboard';
    pinSubject: boolean;
    bilingualPrompts: boolean;
  }) {
    dispatch({
      type: 'SET_BRIEF',
      brief: args.brief,
      refImageUrl: args.refImageDataUrls[0] ?? null,
    });

    // M42-S4: storyboard mini-app 走 3 步流程 — LLM 拼 zh+en 完整 prompt
    // → 用户审查/修改/翻译 → 出图. 这里是第 1 步: LLM 拼 prompt (不出图,
    // 耗时 30-60s). placeholder phase='rewriting_prompts' 表"AI 在想".
    if (args.useCase === 'storyboard') {
      setGenerating({ count: 1, phase: 'rewriting_prompts' });
      try {
        const data = await callStep({
          step: 'storyboard_prompt',
          payload: {
            user_brief: args.brief,
            ref_image_data_urls: args.refImageDataUrls,
            planner_model: args.plannerModel,
            image_model: args.imageModel,
            aspect_ratio: args.aspectRatio,
            image_tier: args.tier,
            image_quality: args.quality,
          },
        });
        if (!data) return;
        const ws = data.message.content?.wizardState as
          | { prompt_zh?: string; prompt_en?: string }
          | null;
        const zh = (ws?.prompt_zh ?? '').trim();
        const en = (ws?.prompt_en ?? '').trim();
        if (!zh || !en) {
          throw new Error('LLM 返回缺少 zh/en, 请重试');
        }
        dispatch({
          type: 'SET_STORYBOARD_PROMPT',
          zh,
          en,
          metadata: data.metadata,
        });
      } finally {
        setGenerating(null);
      }
      return;
    }

    // Step 1 的 selector 选值跟 brief 一起送出, server 在 step='directions'
    // 落到 conv.wizard_metadata, 后续 step='results' 用这些值调对应模型.
    const data = await callStep({
      step: 'directions',
      payload: {
        user_brief: args.brief,
        ref_image_data_urls: args.refImageDataUrls,
        planner_model: args.plannerModel,
        image_model: args.imageModel,
        aspect_ratio: args.aspectRatio,
        image_tier: args.tier,
        image_quality: args.quality,
        use_case: args.useCase,
        pin_subject: args.pinSubject,
        bilingual_prompts: args.bilingualPrompts,
      },
    });
    if (!data) return;
    const directions =
      ((data.message.content?.wizardState as { directions?: Direction[] } | null)
        ?.directions ?? []) as Direction[];
    dispatch({ type: 'SET_DIRECTIONS', directions, metadata: data.metadata });
  }

  async function pickDirection(idx: number, direction: Direction) {
    const data = await callStep({
      step: 'prompts',
      payload: {
        selected_direction_idx: idx,
        direction,
      },
    });
    if (!data) return;
    const ws = (data.message.content?.wizardState ?? null) as {
      prompts?: string[];
      prompts_bilingual?: Array<{ zh: string; en: string }>;
    } | null;
    const prompts = (ws?.prompts ?? []) as string[];
    const promptsBilingual = ws?.prompts_bilingual;
    dispatch({
      type: 'SET_PROMPTS',
      prompts,
      promptsBilingual,
      selectedDirection: direction,
      selectedDirectionIdx: idx,
      metadata: data.metadata,
    });
  }

  async function regenerateDirections() {
    if (!state.userBrief) return;
    const model = findImageModel(state.metadata.image_model) ?? findImageModel(DEFAULT_IMAGE_MODEL)!;
    const refs = state.metadata.ref_image_urls?.length
      ? state.metadata.ref_image_urls
      : state.refImageUrl
        ? [state.refImageUrl]
        : [];
    await submitInput({
      brief: state.userBrief,
      refImageDataUrls: refs,
      plannerModel: state.metadata.planner_model,
      imageModel: state.metadata.image_model,
      aspectRatio: state.metadata.aspect_ratio ?? model.defaultAspect,
      tier: state.metadata.image_tier ?? model.defaultTier,
      quality: state.metadata.image_quality,
      useCase: state.metadata.use_case ?? 'free',
      pinSubject: state.metadata.pin_subject ?? false,
      bilingualPrompts: state.metadata.bilingual_prompts ?? true,
    });
  }

  async function generateBatch(
    prompts: string[],
    basedOnUrl: string | null = null,
    forkedFrom: { iteration: number } | null = null,
    extraRefDataUrls: string[] = [],
    imageOverrides?: {
      imageModel?: string;
      aspectRatio?: AspectRatio;
      tier?: Tier;
      quality?: 'low' | 'medium' | 'high';
    },
  ) {
    setGenerating({ count: prompts.length, phase: 'generating_images' });
    let data: Awaited<ReturnType<typeof callStep>> = null;
    try {
      data = await callStep({
        step: 'results',
        payload: {
          prompts,
          based_on_url: basedOnUrl,
          ...(forkedFrom ? { forked_from: forkedFrom } : {}),
          ...(extraRefDataUrls.length > 0 ? { extra_ref_data_urls: extraRefDataUrls } : {}),
          // M37 + M41 follow-up²: 优化轮 image model / aspect / tier / quality override
          ...(imageOverrides?.imageModel ? { image_model: imageOverrides.imageModel } : {}),
          ...(imageOverrides?.aspectRatio ? { aspect_ratio: imageOverrides.aspectRatio } : {}),
          ...(imageOverrides?.tier ? { image_tier: imageOverrides.tier } : {}),
          ...(imageOverrides?.quality ? { image_quality: imageOverrides.quality } : {}),
        },
      });
    } finally {
      setGenerating(null);
    }
    if (!data) return;
    const ws = (data.message.content?.wizardState ?? null) as {
      iteration?: number;
      results?: IterationResult[];
      based_on_url?: string | null;
      forked_from?: { iteration: number } | null;
    } | null;
    if (ws?.iteration && Array.isArray(ws.results)) {
      const iter: Iteration = {
        iteration: ws.iteration,
        results: ws.results,
        based_on_url: ws.based_on_url ?? null,
        prompts,
        ...(ws.forked_from ? { forked_from: ws.forked_from } : {}),
      };
      dispatch({ type: 'PUSH_ITERATION', iteration: iter, metadata: data.metadata });
    }
    setOptimizeSource(null);
    setEditingIter(null);
  }

  /** M36 补漏: 单张失败重试. 调 step='retry_one' server 替换 results[idx]
   *  后, 用 server 返回的 message 重建当前 iteration 替换到 state. */
  async function retryOne(iteration: number, idx: number) {
    const data = await callStep({
      step: 'retry_one',
      payload: { iteration, idx },
    });
    if (!data) return;
    const ws = (data.message.content?.wizardState ?? null) as {
      iteration?: number;
      results?: IterationResult[];
      based_on_url?: string | null;
      prompts?: string[];
    } | null;
    if (ws?.iteration && Array.isArray(ws.results)) {
      const updated: Iteration = {
        iteration: ws.iteration,
        results: ws.results,
        based_on_url: ws.based_on_url ?? null,
        ...(ws.prompts ? { prompts: ws.prompts } : {}),
      };
      dispatch({ type: 'PUSH_ITERATION', iteration: updated, metadata: data.metadata });
    }
  }

  /** M36 补漏 / M37 强化: 优化轮 — 先调 LLM 改写 prompts, 再 generateBatch
   *  跑生图. 期间整段保持 generating 状态显示占位 grid.
   *
   *  M37 新增:
   *   - plannerModel: 用户在 StepOptimize 选的 LLM 模型 (override conv 默认值)
   *   - extraRefDataUrls: 这一轮额外上传的 ref 图 (logo / 别的参考). LLM 改
   *     写 prompt 时能看见 (multimodal); 生图 batch 把它们 append 到 refs[]
   *     送给 Gemini, 让模型把它们融入生成. 仅本轮生效, 不持久化到 conv-meta.
   */
  async function optimizeAndGenerate(args: {
    newBrief: string;
    plannerModel: string;
    imageModel: string;
    aspectRatio: AspectRatio;
    tier: Tier;
    quality?: 'low' | 'medium' | 'high';
    extraRefDataUrls: string[];
    sourceUrl: string;
  }) {
    // M37: 改写 prompt 阶段, UI 显示 "AI 正在改写 prompt" + 占位淡化
    setGenerating({ count: state.prompts.length || 4, phase: 'rewriting_prompts' });
    try {
      const data = await callStep({
        step: 'optimize_prompts',
        payload: {
          prev_prompts: state.prompts,
          improvement_brief: args.newBrief,
          planner_model: args.plannerModel,
          extra_ref_data_urls: args.extraRefDataUrls,
        },
      });
      if (!data) return;
      const ws = (data.message.content?.wizardState ?? null) as {
        prompts?: string[];
      } | null;
      const newPrompts = ws?.prompts ?? [];
      if (newPrompts.length < 1) {
        toast.error('AI 没改写出 prompt');
        return;
      }
      // 改写后的 prompts 直接传给 generateBatch + 透传 image model overrides.
      // generateBatch 内部 setGenerating 切到 generating_images 阶段.
      await generateBatch(newPrompts, args.sourceUrl, null, args.extraRefDataUrls, {
        imageModel: args.imageModel,
        aspectRatio: args.aspectRatio,
        tier: args.tier,
        quality: args.quality,
      });
    } finally {
      setGenerating(null);
    }
  }

  /**
   * M42-S5 PR-B · 触发段 N 生成. 服务端:
   *  - 段 1: callImageGen 出首帧 + 尾帧 (Gemini + 分镜图 ref)
   *  - 段 N≥2: 复用段 N-1 尾帧 URL, 只出新尾帧
   *  - POST Veo /v1/videos with images=[first, last]
   *  - 返回 segment 结果 (含 videoTask)
   * 前端 dispatch PUSH_VIDEO_SEGMENT 把新段 push 进 state.
   *
   * 耗时: 段 1 ~30-60s (2 张 Gemini 图 + Veo POST), 段 N ~20-40s (1 张图 + Veo).
   * 期间 setGenerating 显占位, 完成后 step='video_gen' 进 segment 视图.
   */
  async function generateVideoSegment(
    seq: number,
    plan: VideoSegment[],
    segments: VideoSegmentResult[],
  ) {
    const segment = plan.find((p) => p.seq === seq);
    if (!segment) {
      toast.error(`段 ${seq} 不在 plan 中`);
      return;
    }
    const prevSegment = segments.find((s) => s.seq === seq - 1);
    setGenerating({ count: 1, phase: 'rewriting_prompts' });
    try {
      const data = await callStep<{
        seq?: number;
        first_frame_url?: string;
        last_frame_url?: string;
        videoTask?: VideoSegmentResult['videoTask'];
      }>({
        step: 'video_segment',
        payload: {
          seq,
          segment,
          prev_last_frame_url: prevSegment?.lastFrameUrl,
        },
      });
      if (!data) return;
      // 服务端把 segment 写进 message.content.videoTask + wizardState
      const ws = data.message.content?.wizardState as
        | {
            seq?: number;
            first_frame_url?: string;
            last_frame_url?: string;
          }
        | null;
      const videoTask = data.message.content?.videoTask as
        | VideoSegmentResult['videoTask']
        | undefined;
      if (!ws || !videoTask || !ws.first_frame_url || !ws.last_frame_url) {
        toast.error('段生成响应缺字段');
        return;
      }
      dispatch({
        type: 'PUSH_VIDEO_SEGMENT',
        segment: {
          seq: ws.seq ?? seq,
          firstFrameUrl: ws.first_frame_url,
          lastFrameUrl: ws.last_frame_url,
          videoTask,
          messageDbId: data.message.id,
        },
        metadata: data.metadata,
      });
    } finally {
      setGenerating(null);
    }
  }

  async function pickFinal(url: string, iter: number) {
    const data = await callStep({
      step: 'done',
      payload: { final_url: url, iteration: iter },
    });
    if (!data) return;
    dispatch({
      type: 'SET_DONE',
      finalUrl: url,
      finalIteration: iter,
      metadata: data.metadata,
    });
  }

  // ---------- render ----------

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-muted">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <WizardProgressBar
          step={step}
          onJumpTo={(target) => {
            // M37: 点已完成段跳回. 跳回不破坏 state.iterations, 用户能再前进
            // 时编号继续递增. transient state (optimizing/editingIter) 清空.
            setOptimizeSource(null);
            setEditingIter(null);
            // 跳回 prompts 必须有 selectedDirection (没就先不动)
            if (target === 'prompts' && !state.selectedDirection) return;
            dispatch({ type: 'GOTO_STEP', step: target });
          }}
        />
      </header>

      <main key={step} className="flex-1 [animation:wizard-step-in_0.4s_ease-out]">
        {state.iterations.length > 0 && step !== 'done' && (
          <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
            <WizardHistory
              iterations={state.iterations}
              currentIteration={currentIteration?.iteration ?? null}
              onEditPrompts={(iter) => {
                if (!iter.prompts || iter.prompts.length === 0) return;
                setOptimizeSource(null);
                setEditingIter({ iteration: iter.iteration, prompts: iter.prompts });
              }}
            />
          </div>
        )}

        {generating && (
          <GeneratingPlaceholder
            count={generating.count}
            iteration={(currentIteration?.iteration ?? 0) + 1}
            phase={generating.phase}
            imageModel={state.metadata.image_model}
          />
        )}

        {!generating && step === 'input' && (() => {
          const model =
            findImageModel(state.metadata.image_model) ?? findImageModel(DEFAULT_IMAGE_MODEL)!;
          const initialRefs = state.metadata.ref_image_urls?.length
            ? state.metadata.ref_image_urls
            : state.refImageUrl
              ? [state.refImageUrl]
              : [];
          return (
            <StepInputV2
              initialBrief={state.userBrief}
              initialRefImageUrls={initialRefs}
              plannerModel={state.metadata.planner_model}
              imageModel={state.metadata.image_model}
              aspectRatio={state.metadata.aspect_ratio ?? model.defaultAspect}
              tier={state.metadata.image_tier ?? model.defaultTier}
              quality={state.metadata.image_quality}
              useCase={state.metadata.use_case ?? 'free'}
              pinSubject={state.metadata.pin_subject ?? false}
              bilingualPrompts={state.metadata.bilingual_prompts ?? true}
              onSubmit={submitInput}
              busy={busy}
            />
          );
        })()}

        {!generating && step === 'directions' && (
          <StepDirections
            directions={state.directions}
            onPick={pickDirection}
            onRegenerate={regenerateDirections}
            busy={busy}
          />
        )}

        {!generating && step === 'prompts' && editingIter && (
          <StepPromptsReview
            prompts={editingIter.prompts}
            onChangePrompts={(next) =>
              setEditingIter({ iteration: editingIter.iteration, prompts: next })
            }
            onBack={() => setEditingIter(null)}
            onGenerate={(final) =>
              void generateBatch(final, null, { iteration: editingIter.iteration })
            }
            maxImages={4}
            busy={busy}
          />
        )}

        {!generating && step === 'prompts' && !editingIter && (
          <StepPromptsReview
            prompts={state.prompts}
            promptsBilingual={state.promptsBilingual}
            onChangePrompts={(next) =>
              dispatch({
                type: 'SET_PROMPTS',
                prompts: next,
                promptsBilingual: state.promptsBilingual,
                selectedDirection: state.selectedDirection!,
                selectedDirectionIdx: state.selectedDirectionIdx ?? 0,
                metadata: state.metadata,
              })
            }
            onChangePromptsBilingual={(next) =>
              dispatch({
                type: 'SET_PROMPTS',
                prompts: state.prompts,
                promptsBilingual: next,
                selectedDirection: state.selectedDirection!,
                selectedDirectionIdx: state.selectedDirectionIdx ?? 0,
                metadata: state.metadata,
              })
            }
            onBack={() => dispatch({ type: 'GOTO_STEP', step: 'directions' })}
            onGenerate={(final) => void generateBatch(final)}
            maxImages={state.prompts.length || state.promptsBilingual?.length || 4}
            busy={busy}
          />
        )}

        {!generating && step === 'results' && currentIteration && (
          <StepResultsV2
            iteration={currentIteration}
            busy={busy}
            onOptimize={(url, prompt) => setOptimizeSource({ url, prompt })}
            onPickFinal={pickFinal}
            onRetryOne={(idx) => retryOne(currentIteration.iteration, idx)}
          />
        )}

        {!generating && step === 'optimizing' && optimizeSource && (() => {
          const model =
            findImageModel(state.metadata.image_model) ?? findImageModel(DEFAULT_IMAGE_MODEL)!;
          return (
            <StepOptimize
              sourceUrl={optimizeSource.url}
              sourcePrompt={optimizeSource.prompt}
              iteration={currentIteration?.iteration ?? 1}
              defaultPlannerModel={state.metadata.planner_model}
              defaultImageModel={state.metadata.image_model}
              defaultAspect={state.metadata.aspect_ratio ?? model.defaultAspect}
              defaultTier={state.metadata.image_tier ?? model.defaultTier}
              defaultQuality={state.metadata.image_quality}
              busy={busy}
              onCancel={() => setOptimizeSource(null)}
              onSubmit={async ({
                newBrief,
                plannerModel,
                imageModel,
                aspectRatio,
                tier,
                quality,
                extraRefDataUrls,
              }) => {
                // M36 补漏 / M37 强化 / M41 follow-up²: 优化轮可改 LLM model + 生图 model
                // + aspect + tier + quality + 附加 ref 图, 全透传 server.
                const sourceUrl = optimizeSource.url;
                setOptimizeSource(null);
                await optimizeAndGenerate({
                  newBrief,
                  plannerModel,
                  imageModel,
                  aspectRatio,
                  tier,
                  quality,
                  extraRefDataUrls,
                  sourceUrl,
                });
              }}
            />
          );
        })()}

        {!generating && step === 'done' && state.finalUrl && (
          <StepDone
            finalUrl={state.finalUrl}
            finalIteration={state.finalIteration}
            // M42-S5 PR-A: storyboard mini-app 才显"继续制作视频"按钮.
            // 点击 → POST step='video_plan' → LLM 读分镜图出 N 段规划 →
            // dispatch SET_VIDEO_PLAN, 推进到 step='video_plan'.
            onContinueToVideo={
              state.metadata.use_case === 'storyboard'
                ? async () => {
                    setBusy(true);
                    try {
                      const data = await callStep<{ video_plan?: VideoSegment[] }>({
                        step: 'video_plan',
                        payload: { planner_model: state.metadata.planner_model },
                      });
                      if (!data) return;
                      const ws = data.message.content?.wizardState as
                        | { video_plan?: VideoSegment[] }
                        | null;
                      const plan = ws?.video_plan ?? data.metadata.video_plan ?? [];
                      if (plan.length === 0) {
                        toast.error('视频规划生成失败');
                        return;
                      }
                      dispatch({
                        type: 'SET_VIDEO_PLAN',
                        videoPlan: plan,
                        metadata: data.metadata,
                      });
                    } finally {
                      setBusy(false);
                    }
                  }
                : undefined
            }
            videoBusy={busy}
          />
        )}

        {/* M42-S5 PR-A: video_plan 步骤渲染 — LLM 出 N 段规划, 用户审查 */}
        {!generating && step === 'video_plan' && state.videoPlan && state.videoPlan.length > 0 && (
          <StepStoryboardVideoPlan
            initialPlan={state.videoPlan}
            finalUrl={state.finalUrl}
            plannerModel={state.metadata.planner_model}
            busy={busy}
            onRegenerate={async () => {
              setBusy(true);
              try {
                const data = await callStep<{ video_plan?: VideoSegment[] }>({
                  step: 'video_plan',
                  payload: { planner_model: state.metadata.planner_model },
                });
                if (!data) return;
                const ws = data.message.content?.wizardState as
                  | { video_plan?: VideoSegment[] }
                  | null;
                const plan = ws?.video_plan ?? data.metadata.video_plan ?? [];
                if (plan.length > 0) {
                  dispatch({
                    type: 'SET_VIDEO_PLAN',
                    videoPlan: plan,
                    metadata: data.metadata,
                  });
                }
              } finally {
                setBusy(false);
              }
            }}
            onConfirm={async (plan) => {
              // M42-S5 PR-B: 真触发 — 先把编辑后的 plan 落 state, 然后调
              // step='video_segment' seq=1 出第一段. 后续段由 video_gen 视图
              // 里的"继续生成段 N+1"按钮触发.
              dispatch({
                type: 'SET_VIDEO_PLAN',
                videoPlan: plan,
                metadata: state.metadata,
              });
              await generateVideoSegment(1, plan, state.videoSegments ?? []);
            }}
          />
        )}

        {/* M42-S5 PR-B: 视频逐段生成视图 */}
        {!generating && step === 'video_gen' && state.videoPlan && state.videoPlan.length > 0 && (
          <StepStoryboardVideoGen
            plan={state.videoPlan}
            segments={state.videoSegments ?? []}
            busy={busy}
            onGenerateSegment={(seq) =>
              generateVideoSegment(seq, state.videoPlan!, state.videoSegments ?? [])
            }
            onTaskUpdate={(seq, videoTask) => {
              dispatch({ type: 'PATCH_VIDEO_SEGMENT_TASK', seq, videoTask });
            }}
          />
        )}

        {/* M42-S4: storyboard 3 步流程的 prompt-review 中间步骤 */}
        {!generating && step === 'prompt_review' && state.storyboardPromptZh && state.storyboardPromptEn && (
          <StepStoryboardPromptReview
            initialZh={state.storyboardPromptZh}
            initialEn={state.storyboardPromptEn}
            imageModel={state.metadata.image_model}
            busy={busy}
            onTranslate={async (zh) => {
              // 不复用 callStep — translate 返回 shape 是 { en, metadata } 不是
              // { message, metadata }, 单独 fetch 一下省得改 callStep 通用 type.
              setBusy(true);
              try {
                const r = await fetch(
                  `/api/conv/v1/conversations/${conversation.id}/wizard/step`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      step: 'storyboard_translate',
                      payload: {
                        prompt_zh: zh,
                        planner_model: state.metadata.planner_model,
                      },
                    }),
                  },
                );
                const j = (await r.json()) as {
                  success?: boolean;
                  message?: string;
                  data?: { en?: string };
                };
                if (!j.success || !j.data?.en) {
                  toast.error(j.message ?? tErr('callFailed'));
                  return null;
                }
                return j.data.en;
              } catch (e) {
                toast.error(e instanceof Error ? e.message : tErr('networkError'));
                return null;
              } finally {
                setBusy(false);
              }
            }}
            onGenerate={async (prompt) => {
              setGenerating({ count: 1, phase: 'generating_images' });
              try {
                const data = await callStep({
                  step: 'storyboard_image',
                  payload: {
                    prompt,
                    image_model: state.metadata.image_model,
                    aspect_ratio: state.metadata.aspect_ratio,
                    image_tier: state.metadata.image_tier,
                    image_quality: state.metadata.image_quality,
                  },
                });
                if (!data) return;
                const finalUrl = data.metadata.final_url;
                if (!finalUrl) throw new Error('生成成功但缺少 final_url');
                dispatch({
                  type: 'SET_DONE',
                  finalUrl,
                  finalIteration: data.metadata.final_iteration ?? 1,
                  metadata: data.metadata,
                });
              } finally {
                setGenerating(null);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
