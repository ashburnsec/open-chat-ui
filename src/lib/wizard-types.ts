/**
 * M36 一键生图 wizard 共享类型. 跟 conv-svc 端的 routes/wizard.ts +
 * services/image-batch.ts 字段保持一致 (snake_case 跨 API; client side
 * 用同样字段不再 camelCase 转换 — 减少一层维护).
 */

import type { AspectRatio, ImageQuality, Tier } from './image-models';
import type { VideoTask } from '@/hooks/use-chat-stream';

export type WizardKind = 'image-gen';

/** M37: 一键生图的用途模式 — 影响 directions / prompts LLM system prompt 选择.
 *  M42-S2: 加 'storyboard' (电影前期制作分镜信息图海报). */
export type UseCase = 'free' | 'ecommerce' | 'poster' | 'storyboard';

/** M37: 中英对照 prompt — 同一变体的两种语言版本. */
export type BilingualPrompt = { zh: string; en: string };

/** M37: 当前选定送给上游生图模型的语言 (默认 zh, 英文版有时上游效果更稳). */
export type PromptsLang = 'zh' | 'en';

export type WizardStep =
  | 'input'
  | 'directions'
  | 'prompts'
  | 'results'
  | 'optimizing'
  | 'done'
  /** M42-S4: storyboard 3 步流程中间步骤 — LLM 拼好 zh+en 等用户审查. */
  | 'prompt_review'
  /** M42-S5 PR-A: storyboard mini-app 续步 — 分镜图 done 后做视频段落规划. */
  | 'video_plan'
  /** M42-S5 PR-B: storyboard 视频逐段生成 (出首尾帧 + Veo). */
  | 'video_gen';

export type Direction = {
  title: string;
  scene: string;
  lighting: string;
  pose: string;
  mood: string;
  summary: string;
};

export type IterationResult = {
  url: string;
  prompt: string;
  error?: string;
};

/**
 * M42-S5 · storyboard mini-app 视频段落规划. LLM 读最终分镜图后输出 N 段
 * (一般 3-5), 每段:
 *  - prompt: 送给 Veo 的视频内容描述 (动作 / 镜头运动 / 节奏)
 *  - first_frame_desc / last_frame_desc: 送给生图模型 (Gemini) 出首尾帧
 *    时的动作描述. 不重述角色/服装/场景 (ref 图 = 分镜图保证一致)
 *  - duration: 视频时长 (4 / 6 / 8 秒)
 *
 * 段间衔接: 段 N+1 首帧 = 段 N 尾帧 URL (复用, 减少生图调用).
 * 段 1 例外: first_frame_desc / last_frame_desc 都要 LLM 生成.
 */
export type VideoSegment = {
  seq: number;
  prompt: string;
  first_frame_desc: string;
  last_frame_desc: string;
  duration: 4 | 6 | 8;
};

/**
 * M42-S5 PR-B · 段执行结果. 服务端跑完 step='video_segment' 后落库 +
 * 推给前端的最小信息. videoTask.status 用现有 useVideoTask hook 轮询.
 */
export type VideoSegmentResult = {
  seq: number;
  /** 首帧图 URL (内部 /api/files/images/... 路径). 段 1 是新出, 段 N≥2
   *  复用段 N-1 尾帧. */
  firstFrameUrl: string;
  /** 尾帧图 URL. 段 N+1 来时复用作首帧. */
  lastFrameUrl: string;
  /** Veo 任务对象 — 直接复用 chat 流的 VideoTask 类型保 VideoCard 兼容. */
  videoTask: VideoTask;
  /** 该段的 message db id, 给前端 patch videoTask 更新轮询结果用. */
  messageDbId: number;
};

export type Iteration = {
  /** 1-based round number. */
  iteration: number;
  /** 4 张候选 (单张失败时 url 空 + error 字段). */
  results: IterationResult[];
  /** 上轮选定的图 (优化轮才有, 第一轮是 null). */
  based_on_url: string | null;
  /** 这一轮用到的 4 个 prompts (display 用). */
  prompts?: string[];
  /** M36 补漏: 从历史第 N 轮 fork 来的标记 (用户编辑 prompts 后重生成).
   *  WizardHistory 用来显示 "↻ from 第 N 轮" badge. */
  forked_from?: { iteration: number };
};

export type WizardMetadata = {
  version: number;
  kind: WizardKind;
  step: WizardStep;
  planner_model: string;
  image_model: string;
  /** @deprecated M36 补漏后用 aspect_ratio + image_tier. 保留只为读老对话. */
  resolution?: string;
  /** M36 补漏: 跟 image_tier 一起取代 resolution. */
  aspect_ratio?: AspectRatio;
  image_tier?: Tier;
  /** M41 follow-up: gpt-image-2 三档质量, 其他模型无此字段. */
  image_quality?: ImageQuality;
  ref_image_url?: string;
  /** M37: 多 ref 图. 老对话只有 ref_image_url, hydrate 时升格成 ref_image_urls=[ref_image_url]. */
  ref_image_urls?: string[];
  /** M37: 用途模式, 默认 'free' (向后兼容). */
  use_case?: UseCase;
  /** M37: 垫图模式 — 产品主体严格一致 (启用时 prompt LLM system prompt 加强约束). */
  pin_subject?: boolean;
  /** M37: 中英对照 prompt 模式. 启用后 LLM 输出 [{zh, en}] 双语 JSON, UI 双栏展示. */
  bilingual_prompts?: boolean;
  /** M37: 当前送图像模型的语言 ('zh' / 'en'). 默认 zh. */
  prompts_lang?: PromptsLang;
  user_brief?: string;
  selected_direction_idx?: number;
  current_iteration?: number;
  final_url?: string;
  final_iteration?: number;
  /** M42-S5 PR-A: storyboard mini-app 视频段落规划. LLM 在 step='video_plan'
   *  阶段输出, 后续 step='video_segment' 按段执行. */
  video_plan?: VideoSegment[];
  /** M42-S5 PR-B: 视频段落生成结果累积 (snake_case 跨 API). */
  video_segments?: Array<{
    seq: number;
    first_frame_url: string;
    last_frame_url: string;
    video_task: Record<string, unknown>;
    message_db_id: number;
  }>;
};

/** 客户端 reducer state (从 conv.wizard_metadata + messages 反序列化得来). */
export type WizardState = {
  conversationId: string;
  metadata: WizardMetadata;
  /** 用户 brief (input 阶段确定) — 也存在 metadata.user_brief, 这里冗余给 UI 取. */
  userBrief: string;
  refImageUrl: string | null;
  /** AI 给的方向候选 (directions 阶段填). */
  directions: Direction[];
  /** 用户选定方向 (prompts 阶段填). */
  selectedDirection: Direction | null;
  selectedDirectionIdx: number | null;
  /** AI 给的 4 个 prompts (review 阶段填, 用户可编辑后送 results). */
  prompts: string[];
  /** M37: 中英对照模式时同步存中英版本 (UI 双栏). prompts 字段是当前活跃语言版本. */
  promptsBilingual?: BilingualPrompt[];
  /** 所有迭代轮次 — 第 N 轮是 iterations[N-1]. */
  iterations: Iteration[];
  /** done 阶段的最终稿 url. */
  finalUrl: string | null;
  finalIteration: number | null;
  /** M42-S4: storyboard mini-app prompt_review 步骤的 zh/en 两版完整 prompt.
   *  其他 mini-app 不用. */
  storyboardPromptZh?: string;
  storyboardPromptEn?: string;
  /** M42-S5 PR-A: storyboard mini-app 视频段落规划 (video_plan 阶段填). */
  videoPlan?: VideoSegment[];
  /** M42-S5 PR-B: storyboard 视频逐段生成结果 (video_gen 阶段填). */
  videoSegments?: VideoSegmentResult[];
};

export type WizardAction =
  | { type: 'SET_BRIEF'; brief: string; refImageUrl: string | null }
  | { type: 'SET_DIRECTIONS'; directions: Direction[]; metadata: WizardMetadata }
  | {
      type: 'SET_PROMPTS';
      prompts: string[];
      promptsBilingual?: BilingualPrompt[];
      selectedDirection: Direction;
      selectedDirectionIdx: number;
      metadata: WizardMetadata;
    }
  | { type: 'PUSH_ITERATION'; iteration: Iteration; metadata: WizardMetadata }
  | { type: 'SET_DONE'; finalUrl: string; finalIteration: number; metadata: WizardMetadata }
  | { type: 'GOTO_STEP'; step: WizardStep }
  /** M42-S4: storyboard LLM 出 zh+en, 存 state 等用户审查. */
  | {
      type: 'SET_STORYBOARD_PROMPT';
      zh: string;
      en: string;
      metadata: WizardMetadata;
    }
  /** M42-S5 PR-A: storyboard LLM 出 N 段视频规划, 存 state 等用户审查. */
  | { type: 'SET_VIDEO_PLAN'; videoPlan: VideoSegment[]; metadata: WizardMetadata }
  /** M42-S5 PR-B: 一段视频生成完成 (或状态更新, 同 seq 覆盖). */
  | { type: 'PUSH_VIDEO_SEGMENT'; segment: VideoSegmentResult; metadata: WizardMetadata }
  /** M42-S5 PR-B: 段 videoTask polling 更新, 不动 metadata. */
  | {
      type: 'PATCH_VIDEO_SEGMENT_TASK';
      seq: number;
      videoTask: VideoSegmentResult['videoTask'];
    };
