/**
 * Heuristic — which model names are NOT usable from the chat surface.
 * Image / audio / video / embedding models live on different relay
 * endpoints (`/v1/images/*`, `/v1/audio/*`, `/v1/embeddings`) and would
 * just 4xx through `/pg/chat/completions`. Filter them so the model
 * picker stays useful.
 *
 * Shared between ChatPanel (header model picker) and AgentsPanel (the
 * "start a conversation with…" picker). Keeping them in sync via this
 * helper avoids the trap of one surface offering a model the other
 * silently rejects.
 */
import { findModelEntry, stripChannelSuffix } from './models-catalog';

export function isNonChatModel(name: string): boolean {
  // M29-I: catalog drives this. Every category appears on the chat
  // picker — the composer routes each through a dedicated flow:
  //   chat / code → SSE chat completions
  //   image / video / audio → dedicated mode (image_generation tool,
  //   /v1/videos task, /api/audio/speech proxy).
  const entry = findModelEntry(name);
  if (entry) return false;
  const m = name.toLowerCase();
  // Gemini's image-output family — both the stable `*-image` (e.g.
  // `gemini-2.5-flash-image`, the "Nano Banana") and the preview
  // `*-image-preview` (3.1-flash, 3-pro) — speak plain Chat
  // Completions and return their image as
  // `![image](data:image/png;base64,...)` inside the regular content
  // payload. Same SSE shape as a text-only turn. Keep them on the
  // chat surface; only the dedicated image endpoints (gpt-image-2,
  // dall-e-*) need to be filtered.
  if (m.startsWith('gemini-') && m.includes('image')) return false;
  if (/(^|-)image(-|$|\d)/.test(m)) return true; // gpt-image-2, dall-e-*
  if (m.startsWith('dall-e')) return true;
  if (m.startsWith('tts-') || m.includes('-tts')) return true;
  if (m.startsWith('whisper')) return true;
  if (m.startsWith('sora')) return true;
  // M27: veo-* are video-task models; they ARE selectable from the chat
  // surface — ChatComposer detects them and switches to the video flow
  // (POST /v1/videos + client-side polling). Keep them out of the
  // sora/mj_/suno_/flux list.
  if (m.startsWith('mj_') || m.startsWith('suno_')) return true;
  if (m.startsWith('flux')) return true;
  if (m.includes('embedding')) return true;
  if (m.includes('rerank')) return true;
  return false;
}

/**
 * Per-model safe upper bound for `max_tokens`. Returns `undefined` for
 * models that don't need a cap (use the upstream default).
 *
 * Background: gemini-3-pro-image-preview / gemini-3.1-flash-image-preview
 * return their image as base64-encoded PNG inside the chat content. A
 * single 1024-pixel image is ~1300 image tokens — anything above ~100
 * caller-set max_tokens routinely returns `429 Resource exhausted`
 * because the per-call image-token budget gets blown past while the
 * model still thinks it has tokens left to write text. Capping at 80
 * keeps both the text reply and the image inside the budget.
 */
export function getModelMaxTokensCap(
  model: string | null | undefined,
): number | undefined {
  if (!model) return undefined;
  if (model.toLowerCase().includes('-image-preview')) return 80;
  return undefined;
}

export function filterChatModels(raw: string[]): string[] {
  return raw.filter((m) => !isNonChatModel(m));
}

/**
 * M27: Veo 2.x / 3.x async video generation. The surface uses the same
 * model picker but skips the SSE chat-completions path entirely — the
 * composer hides reasoning / web_search / image_generation, shows a
 * duration picker (4 / 8 / 16 s), and routes through `/v1/videos`. Keep
 * `getModelCapabilities` returning all-false for these models so no
 * stale toggle leaks through; the composer reads this flag instead.
 */
export function isVideoModel(model: string | null | undefined): boolean {
  if (!model) return false;
  // M29-B: trust catalog category; fall back to bare-name check for
  // unknown ids.
  const entry = findModelEntry(model);
  if (entry) return entry.category === 'video';
  return stripChannelSuffix(model).toLowerCase().startsWith('veo-');
}

/**
 * Per-model capability flags. Drives composer button visibility so we
 * never offer a feature the upstream silently drops.
 *
 * Sources of truth (verified empirically + via vendor docs):
 *
 *   - `webSearch` — only OpenAI-routed models. The web-search button on
 *     chat-portal pipes through M10's Responses API path, which is
 *     exclusive to OpenAI. Foundry's `/models/chat/completions` for
 *     DeepSeek/Grok/Kimi has no built-in `web_search` tool, so this
 *     button must hide for those.
 *
 *   - `reasoning` — only OpenAI gpt-5 / o-series accept the
 *     `reasoning_effort` knob meaningfully. Grok-4 explicitly rejects
 *     it (per xAI docs); DeepSeek-V3.x and Kimi-K2.x accept the field
 *     but ignore the value (their CoT/thinking mode runs by default
 *     regardless), so showing a knob the user can't actually move is
 *     misleading.
 *
 *   - `vision` — image_url multimodal input. gpt-5/4o family, Grok-4
 *     family, Kimi-K2.5+ all accept it. DeepSeek V3.x is text-only —
 *     the broker silently drops the image and the model hallucinates.
 */
export type ModelCapabilities = {
  webSearch: boolean;
  reasoning: boolean;
  vision: boolean;
  /** Whether this model can use the Responses API built-in image_generation
   *  tool (M16). Currently OpenAI-only — other vendors' tool calling APIs
   *  don't ship an `image_generation` built-in, so the button hides. */
  imageGeneration: boolean;
  /** M27: Veo async video task. When true the composer switches to video
   *  mode (hides chat-only toggles, shows a duration picker) and the
   *  send path routes through POST /v1/videos instead of SSE chat. */
  video: boolean;
  /** M29-I: TTS / audio model. Composer shows a voice cycle picker
   *  and the send path routes through /api/audio/speech, attaching
   *  the synthesised mp3 as an inline assistant message (in-memory
   *  only — V1 doesn't persist audio replies to conv history). */
  audio: boolean;
};

export function getModelCapabilities(model: string | null | undefined): ModelCapabilities {
  if (!model) {
    // Conservative when we don't know the model yet — show nothing
    // rather than show buttons that would 4xx on send.
    return {
      webSearch: false,
      reasoning: false,
      vision: false,
      imageGeneration: false,
      video: false,
      audio: false,
    };
  }
  // M29-I: catalog category drives audio detection.
  const entry = findModelEntry(model);
  if (entry?.category === 'audio') {
    return {
      webSearch: false,
      reasoning: false,
      vision: false,
      imageGeneration: false,
      video: false,
      audio: true,
    };
  }
  // M42-S1: image-native 模型 (gpt-image-2 / gemini-*-image-preview) 不接 chat
  // 工具栈 — reasoning/webSearch/image_generation tool/协作 都没意义.
  // vision (paperclip 上传 ref 图) 仅 Gemini 系接, gpt-image-2 通过
  // /v1/images/generations 不接 ref. 父用 imageNative prop 控制 aspect/tier
  // /quality picker 显示, 跟这里的 capabilities 是不同维度.
  if (entry?.category === 'image') {
    const isGptImage = model.toLowerCase().startsWith('gpt-image');
    return {
      webSearch: false,
      reasoning: false,
      vision: !isGptImage,
      imageGeneration: false,
      video: false,
      audio: false,
    };
  }
  // Strip any legacy __channel suffix (pre-M32-2.B mangled ids saved
  // in old conversations / localStorage) before vendor inference.
  const m = stripChannelSuffix(model).toLowerCase();
  // M27: Veo video task model — none of the chat-only toggles apply.
  if (m.startsWith('veo-')) {
    return {
      webSearch: false,
      reasoning: false,
      vision: false,
      imageGeneration: false,
      video: true,
      audio: false,
    };
  }
  const isOpenAI =
    m.startsWith('gpt-') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.startsWith('chatgpt');

  // M20 / M29-B / M32-2.B: Azure-direct upstream channels don't host
  // the OpenAI Images backend, so the image_generation built-in tool
  // 404s when a request RR's there. Post-M32 the gpt-5.x family RRs
  // across multiple channels including Azure direct, so we hide image
  // gen for the whole family. Legacy `-azure` suffix kept for any
  // pre-M29 conversation rows still carrying it.
  const isAzureDirect =
    m.endsWith('-azure') || modelRequiresResponsesApi(model) || m.startsWith('gpt-5');

  // M-channel-1-extension: Claude 4.x / 3.5+ family arrives via the
  // 159.54.181.8 reverse-proxy speaking OpenAI Chat Completions —
  // new-api translates `image_url` parts into Anthropic's `image`
  // blocks transparently, so multimodal works. We do NOT enable the
  // reasoning toggle yet: Anthropic's native knob is
  // `thinking.budget_tokens`, and the reverse-proxy isn't known to
  // translate `reasoning_effort` to it. Probe before flipping.
  const isClaude = m.startsWith('claude-');

  // Gemini 2.5+ / 3.x family is natively multimodal. Same
  // reasoning-toggle caveat as Claude — Google uses
  // `thinking_config.thinking_budget`, not `reasoning_effort`.
  const isGemini = m.startsWith('gemini-') || m.startsWith('gemma');

  return {
    // M29-D: web_search is now vendor-agnostic — Tavily fills in for
    // non-OpenAI models in conv-svc. Composer button shows on every
    // chat-eligible model.
    webSearch: true,
    reasoning: isOpenAI,
    vision:
      isOpenAI ||                  // gpt-4o / gpt-5 family is multimodal
      isClaude ||                  // Claude 3.5+ / 4.x all accept image_url parts
      isGemini ||                  // Gemini 2.5+ / 3.x natively multimodal
      m.startsWith('grok-4') ||    // Grok 4 / 4-fast / 4-20 variants
      m.startsWith('kimi-k2'),     // K2.5 + K2.6 (and any future K2.x)
    imageGeneration: isOpenAI && !isAzureDirect,
    video: false,
    audio: false,
  };
}

/**
 * Whether a model needs the Responses-API request shape on the wire.
 *
 * Post M32-2.B chat-portal sends bare model names; newapi RR's across
 * channels (incl. Azure direct) and adapts to whatever upstream needs.
 * The web client no longer forces `/v1/responses` based on catalog
 * metadata — the conv-svc gate is feature-driven (built-in tools like
 * web_search / image_generation) instead.
 *
 * Kept as a function (not a constant) for the legacy `-azure` suffix
 * branch: any pre-M29 conversation row that still carries
 * `gpt-5.4-azure` rehydrates to a Responses-only routing decision so
 * old turns replay correctly.
 */
export function modelRequiresResponsesApi(model: string | null | undefined): boolean {
  if (!model) return false;
  return model.toLowerCase().endsWith('-azure');
}

/**
 * M21: per-model reasoning_effort whitelist.
 *
 * OpenAI's Responses API now accepts five effort tiers:
 *   minimal · low · medium · high · xhigh
 *
 * But not every model accepts every tier — `gpt-5.4-pro` rejects
 * `low` / `minimal` outright (probed against the carlosi Azure
 * deployment 2026-05). The picker should only cycle through the
 * tiers a given model actually supports.
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const PRO_EFFORTS: readonly ReasoningEffort[] = ['medium', 'high', 'xhigh'];
const STANDARD_EFFORTS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export function getValidReasoningEfforts(
  model: string | null | undefined,
): readonly ReasoningEffort[] {
  if (!model) return [];
  if (!getModelCapabilities(model).reasoning) return [];
  const m = model.toLowerCase();
  // gpt-5.4-pro / gpt-5.4-pro-azure / future *-pro reject the low end.
  if (m.includes('-pro')) return PRO_EFFORTS;
  return STANDARD_EFFORTS;
}
