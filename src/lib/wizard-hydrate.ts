/**
 * M36 · 从 (conversation, messages[]) 反序列化 WizardState. 让用户从
 * /history 进入历史 wizard 对话能直接接着上次进度走 — 没有 client-only
 * state.
 */

import {
  DEFAULT_IMAGE_MODEL,
  findImageModel,
  legacyResolutionToAspectTier,
} from './image-models';
import type {
  Direction,
  Iteration,
  IterationResult,
  WizardMetadata,
  WizardState,
} from './wizard-types';

type AnyContent = Record<string, unknown>;

type RawMessage = {
  id: number;
  role: string;
  content: AnyContent | null;
};

type RawConversation = {
  id: string;
  wizardMetadata?: WizardMetadata | null;
  wizard_metadata?: WizardMetadata | null;
};

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function metaFrom(conv: RawConversation): WizardMetadata {
  const raw = (conv.wizardMetadata ?? conv.wizard_metadata ?? null) as
    | WizardMetadata
    | null;
  if (!raw) {
    return {
      version: 1,
      kind: 'image-gen',
      step: 'input',
      planner_model: 'gpt-5.5',
      image_model: DEFAULT_IMAGE_MODEL,
      aspect_ratio: '1:1',
      image_tier: '1K',
    };
  }
  // M36 补漏兜底:
  // 1. 老对话写过 image_model='gpt-image-2' (M36 v1 默认) — selector 已
  //    移除该模型, 强制改成 Nano Banana 防止 step='results' 拿到不可用
  //    模型. (Migration 0015 同步 SQL 刷盘.)
  // 2. 老对话只有 resolution string, 没有 aspect_ratio + image_tier —
  //    用 legacyResolutionToAspectTier 派生.
  const imageModel =
    findImageModel(raw.image_model) == null ? DEFAULT_IMAGE_MODEL : raw.image_model;
  let { aspect_ratio: aspect, image_tier: tier } = raw;
  if (!aspect || !tier) {
    const derived = legacyResolutionToAspectTier(raw.resolution);
    aspect = aspect ?? derived.aspect;
    tier = tier ?? derived.tier;
  }
  // M37: ref_image_urls 兼容 — 老对话只有 ref_image_url string, 升格成数组.
  const refImageUrls =
    Array.isArray(raw.ref_image_urls) && raw.ref_image_urls.length > 0
      ? raw.ref_image_urls
      : raw.ref_image_url
        ? [raw.ref_image_url]
        : [];
  return {
    ...raw,
    image_model: imageModel,
    aspect_ratio: aspect,
    image_tier: tier,
    ref_image_urls: refImageUrls,
    use_case: raw.use_case ?? 'free',
    pin_subject: raw.pin_subject ?? false,
  };
}

export function hydrateWizardState(
  conv: RawConversation,
  messages: RawMessage[],
): WizardState {
  const metadata = metaFrom(conv);
  const state: WizardState = {
    conversationId: conv.id,
    metadata,
    userBrief: metadata.user_brief ?? '',
    refImageUrl: metadata.ref_image_url ?? null,
    directions: [],
    selectedDirection: null,
    selectedDirectionIdx: null,
    prompts: [],
    iterations: [],
    finalUrl: metadata.final_url ?? null,
    finalIteration: metadata.final_iteration ?? null,
  };

  // 按时间顺序扫 messages, 累积每阶段的 wizardState 数据.
  for (const m of messages) {
    const ws = (m.content?.wizardState ?? null) as
      | { step?: string; [k: string]: unknown }
      | null;
    if (!ws) continue;
    switch (ws.step) {
      case 'input': {
        state.userBrief = (ws.user_brief as string) ?? state.userBrief;
        state.refImageUrl =
          (ws.ref_image_url as string | null) ?? state.refImageUrl;
        break;
      }
      case 'directions': {
        const dirs = asArray<Direction>(ws.directions);
        if (dirs.length > 0) state.directions = dirs;
        break;
      }
      case 'directions_picked': {
        const idx = ws.selected_direction_idx as number | undefined;
        if (typeof idx === 'number' && state.directions[idx]) {
          state.selectedDirection = state.directions[idx];
          state.selectedDirectionIdx = idx;
        }
        break;
      }
      case 'prompts': {
        const ps = asArray<string>(ws.prompts);
        if (ps.length > 0) state.prompts = ps;
        // M37: 双语对照
        const bp = asArray<{ zh?: string; en?: string }>(ws.prompts_bilingual);
        if (bp.length > 0) {
          state.promptsBilingual = bp.map((o) => ({
            zh: String(o.zh ?? ''),
            en: String(o.en ?? ''),
          }));
        }
        const idx = ws.based_on_direction_idx as number | undefined;
        if (typeof idx === 'number' && state.directions[idx]) {
          state.selectedDirection = state.directions[idx];
          state.selectedDirectionIdx = idx;
        }
        break;
      }
      case 'generating': {
        // user 触发的轻量记录, 没有图片数据
        break;
      }
      case 'results': {
        const iter = ws.iteration as number | undefined;
        const results = asArray<IterationResult>(ws.results);
        if (typeof iter === 'number' && results.length > 0) {
          const based_on_url = (ws.based_on_url as string | null) ?? null;
          const forkedFromRaw = ws.forked_from as
            | { iteration?: number }
            | undefined;
          const forked_from =
            forkedFromRaw && typeof forkedFromRaw.iteration === 'number'
              ? { iteration: forkedFromRaw.iteration }
              : undefined;
          const prompts = asArray<string>(ws.prompts);
          // 同 iteration number 之前已 push 过的话覆盖 (通常不会, 但
          // re-emit 保守).
          const existing = state.iterations.find((i) => i.iteration === iter);
          if (existing) {
            existing.results = results;
            existing.based_on_url = based_on_url;
            if (forked_from) existing.forked_from = forked_from;
            if (prompts.length > 0) existing.prompts = prompts;
          } else {
            state.iterations.push({
              iteration: iter,
              results,
              based_on_url,
              ...(forked_from ? { forked_from } : {}),
              ...(prompts.length > 0 ? { prompts } : {}),
            });
          }
        }
        break;
      }
      case 'done': {
        state.finalUrl = (ws.final_url as string) ?? state.finalUrl;
        const iter = ws.iteration as number | undefined;
        if (typeof iter === 'number') state.finalIteration = iter;
        break;
      }
      // M42-S4: storyboard prompt_review 步骤 — LLM 输出 zh+en, 持久化
      // 到 messages 让刷新页面还能回到审查界面.
      case 'prompt_review': {
        const zh = (ws.prompt_zh as string | undefined) ?? '';
        const en = (ws.prompt_en as string | undefined) ?? '';
        if (zh) state.storyboardPromptZh = zh;
        if (en) state.storyboardPromptEn = en;
        break;
      }
      // M42-S5 PR-A: storyboard video_plan 步骤 — LLM 输出 N 段视频规划.
      case 'video_plan': {
        const plan = asArray<{
          seq?: number;
          prompt?: string;
          first_frame_desc?: string;
          last_frame_desc?: string;
          duration?: number;
        }>(ws.video_plan);
        if (plan.length > 0) {
          state.videoPlan = plan.map((s, idx) => ({
            seq: typeof s.seq === 'number' ? s.seq : idx + 1,
            prompt: String(s.prompt ?? ''),
            first_frame_desc: String(s.first_frame_desc ?? ''),
            last_frame_desc: String(s.last_frame_desc ?? ''),
            duration: [4, 6, 8].includes(Number(s.duration))
              ? (Number(s.duration) as 4 | 6 | 8)
              : 8,
          }));
        }
        break;
      }
      // M42-S5 PR-B: 单段视频生成结果 — 累积到 state.videoSegments.
      case 'video_segment': {
        const seq = Number(ws.seq);
        const firstFrameUrl = String(ws.first_frame_url ?? '');
        const lastFrameUrl = String(ws.last_frame_url ?? '');
        const videoTask = (ws.video_task ?? m.content?.videoTask) as
          | Record<string, unknown>
          | undefined;
        if (Number.isInteger(seq) && seq >= 1 && firstFrameUrl && lastFrameUrl && videoTask) {
          if (!state.videoSegments) state.videoSegments = [];
          const idx = state.videoSegments.findIndex((s) => s.seq === seq);
          const entry = {
            seq,
            firstFrameUrl,
            lastFrameUrl,
            // videoTask 是 m.content.videoTask, 跟普通 chat 视频 task 同 shape.
            // status 来自上游字符串, 这里 cast 到 union — 非法字符串实际会
            // 让 useVideoTask 轮询解析时纠正 (e.g. 'queued' / 'in_progress').
            videoTask: {
              taskId: String(videoTask.taskId ?? ''),
              model: String(videoTask.model ?? 'veo-3.1-generate-001'),
              prompt: String(videoTask.prompt ?? ''),
              status: (String(videoTask.status ?? 'queued') as
                | 'queued'
                | 'in_progress'
                | 'completed'
                | 'failed'),
              progress:
                typeof videoTask.progress === 'number' ? videoTask.progress : undefined,
              submittedAt:
                typeof videoTask.submittedAt === 'number'
                  ? videoTask.submittedAt
                  : Date.now(),
              durationSeconds:
                typeof videoTask.durationSeconds === 'number'
                  ? videoTask.durationSeconds
                  : undefined,
              videoUrl:
                typeof videoTask.videoUrl === 'string' ? videoTask.videoUrl : undefined,
              errorMessage:
                typeof videoTask.errorMessage === 'string'
                  ? videoTask.errorMessage
                  : undefined,
            },
            messageDbId: typeof m.id === 'number' ? m.id : 0,
          };
          if (idx >= 0) state.videoSegments[idx] = entry;
          else state.videoSegments.push(entry);
        }
        break;
      }
    }
  }
  // 段按 seq 排序
  if (state.videoSegments) state.videoSegments.sort((a, b) => a.seq - b.seq);

  // iterations 按 iteration number 排序
  state.iterations.sort((a, b) => a.iteration - b.iteration);

  return state;
}
