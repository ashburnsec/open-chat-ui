// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  filterChatModels,
  getModelCapabilities,
  getModelMaxTokensCap,
  getValidReasoningEfforts,
  isNonChatModel,
  isVideoModel,
  modelRequiresResponsesApi,
} from './chat-models';

describe('isNonChatModel', () => {
  it('flags image / audio / embedding models', () => {
    expect(isNonChatModel('dall-e-3')).toBe(true);
    expect(isNonChatModel('gpt-image-1')).toBe(true);
    expect(isNonChatModel('whisper-1')).toBe(true);
    expect(isNonChatModel('tts-1-hd')).toBe(true);
    expect(isNonChatModel('text-embedding-3-large')).toBe(true);
    expect(isNonChatModel('rerank-multilingual-v3.0')).toBe(true);
    expect(isNonChatModel('flux-1.1-pro')).toBe(true);
  });

  it('keeps real chat models', () => {
    expect(isNonChatModel('gpt-5.4')).toBe(false);
    expect(isNonChatModel('gpt-5.4-pro-azure')).toBe(false);
    expect(isNonChatModel('deepseek-v3.5')).toBe(false);
    expect(isNonChatModel('grok-4-fast')).toBe(false);
  });

  // M27: veo-* models drive the async video task flow but ARE selectable
  // from the chat surface (composer routes them through POST /v1/videos
  // when picked). They must NOT be filtered out by isNonChatModel.
  it('keeps veo-* models on the picker (composer switches to video flow)', () => {
    expect(isNonChatModel('veo-2.0-generate-001')).toBe(false);
    expect(isNonChatModel('veo-3.0-generate-001')).toBe(false);
    expect(isNonChatModel('veo-3.0-fast-generate-001')).toBe(false);
  });

  // Gemini *-image-preview returns base64 PNG inline in chat content,
  // so it MUST stay on the chat surface. Without this carve-out the
  // generic `image-` substring filter would hide them.
  it('keeps gemini *-image-preview as chat models (return base64 in content)', () => {
    expect(isNonChatModel('gemini-3.1-flash-image-preview')).toBe(false);
    expect(isNonChatModel('gemini-3-pro-image-preview')).toBe(false);
    // But gemini-2.5-flash-image (Google's stable image model, distinct
    // from preview) still goes through the chat surface in our setup —
    // upstream lets it accept chat-shape requests too.
    expect(isNonChatModel('gemini-2.5-flash-image')).toBe(false);
  });
});

describe('getModelMaxTokensCap', () => {
  it('caps image-preview models to keep image-token budget under 429 limit', () => {
    expect(getModelMaxTokensCap('gemini-3.1-flash-image-preview')).toBe(80);
    expect(getModelMaxTokensCap('gemini-3-pro-image-preview')).toBe(80);
  });
  it('returns undefined (no cap) for ordinary chat models', () => {
    expect(getModelMaxTokensCap('gpt-5.4')).toBeUndefined();
    expect(getModelMaxTokensCap('claude-opus-4-7')).toBeUndefined();
    expect(getModelMaxTokensCap('gemini-2.5-pro')).toBeUndefined();
    expect(getModelMaxTokensCap(null)).toBeUndefined();
    expect(getModelMaxTokensCap(undefined)).toBeUndefined();
  });
});

describe('filterChatModels', () => {
  it('strips non-chat models from a mixed list', () => {
    const out = filterChatModels(['gpt-5.4', 'dall-e-3', 'whisper-1', 'kimi-k2.6']);
    expect(out).toEqual(['gpt-5.4', 'kimi-k2.6']);
  });
  it('keeps veo-* models (composer switches them to video flow)', () => {
    const out = filterChatModels([
      'gpt-5.4',
      'veo-3.0-generate-001',
      'dall-e-3',
      'veo-3.0-fast-generate-001',
    ]);
    expect(out).toEqual(['gpt-5.4', 'veo-3.0-generate-001', 'veo-3.0-fast-generate-001']);
  });
});

describe('isVideoModel', () => {
  it('flags veo-* as video-task', () => {
    expect(isVideoModel('veo-2.0-generate-001')).toBe(true);
    expect(isVideoModel('veo-3.0-generate-001')).toBe(true);
    expect(isVideoModel('veo-3.0-fast-generate-001')).toBe(true);
    expect(isVideoModel('VEO-3.0-FAST-GENERATE-001')).toBe(true);
  });
  it('returns false for ordinary chat models and null/undefined', () => {
    expect(isVideoModel('gpt-5.4')).toBe(false);
    expect(isVideoModel('claude-opus-4-7')).toBe(false);
    expect(isVideoModel('gemini-3.1-flash-image-preview')).toBe(false);
    expect(isVideoModel(null)).toBe(false);
    expect(isVideoModel(undefined)).toBe(false);
  });
});

describe('getModelCapabilities', () => {
  it('returns nothing-enabled for null/empty model', () => {
    expect(getModelCapabilities(null)).toEqual({
      webSearch: false,
      reasoning: false,
      vision: false,
      imageGeneration: false,
      video: false,
      audio: false,
    });
    expect(getModelCapabilities(undefined)).toEqual({
      webSearch: false,
      reasoning: false,
      vision: false,
      imageGeneration: false,
      video: false,
      audio: false,
    });
  });

  it('flips video flag for veo-* and zeroes the rest', () => {
    for (const m of [
      'veo-2.0-generate-001',
      'veo-3.0-generate-001',
      'veo-3.0-fast-generate-001',
    ]) {
      const c = getModelCapabilities(m);
      expect(c.video, `${m} video`).toBe(true);
      expect(c.webSearch, `${m} webSearch`).toBe(false);
      expect(c.reasoning, `${m} reasoning`).toBe(false);
      expect(c.vision, `${m} vision`).toBe(false);
      expect(c.imageGeneration, `${m} imageGen`).toBe(false);
      expect(c.audio, `${m} audio`).toBe(false);
    }
  });

  it('flips audio flag for catalog audio-category models', () => {
    const c = getModelCapabilities('gpt-4o-mini-tts');
    expect(c.audio).toBe(true);
    expect(c.video).toBe(false);
    expect(c.webSearch).toBe(false);
    expect(c.imageGeneration).toBe(false);
  });

  // M32-2.B: gpt-5.x models RR across channels including Azure direct,
  // where the image_generation built-in tool 404s. Image gen is hidden
  // for the whole gpt-5 family; web/reasoning/vision stay on.
  it('hides image_generation for gpt-5.x family (Azure RR)', () => {
    for (const m of ['gpt-5.3-codex', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.5', 'gpt-5.4-mini']) {
      const caps = getModelCapabilities(m);
      expect(caps.webSearch, `${m} webSearch`).toBe(true);
      expect(caps.reasoning, `${m} reasoning`).toBe(true);
      expect(caps.vision, `${m} vision`).toBe(true);
      expect(caps.imageGeneration, `${m} imageGen`).toBe(false);
    }
  });

  it('hides image_generation for legacy -azure direct ids', () => {
    const caps = getModelCapabilities('gpt-5.4-pro-azure');
    expect(caps.webSearch).toBe(true);
    expect(caps.reasoning).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.imageGeneration).toBe(false);
  });

  // M29-D: web search is now vendor-agnostic via Tavily, so all
  // chat-eligible models advertise webSearch=true. Reasoning + vision
  // remain per-vendor capability flags.
  it('grok-4 + kimi-k2: vision + Tavily search, no reasoning', () => {
    const grok = getModelCapabilities('grok-4-fast');
    expect(grok.webSearch).toBe(true);
    expect(grok.reasoning).toBe(false);
    expect(grok.vision).toBe(true);
    expect(grok.imageGeneration).toBe(false);

    const kimi = getModelCapabilities('kimi-k2.6');
    expect(kimi.vision).toBe(true);
    expect(kimi.reasoning).toBe(false);
    expect(kimi.webSearch).toBe(true);
  });

  it('deepseek: text-only with Tavily search', () => {
    const ds = getModelCapabilities('deepseek-v3.5');
    expect(ds.vision).toBe(false);
    expect(ds.reasoning).toBe(false);
    expect(ds.webSearch).toBe(true);
  });

  // M-channel-1-extension: Claude 3.5+ / 4.x family arrives via the
  // 159.54 reverse-proxy speaking OpenAI Chat Completions. We enable
  // vision (image_url parts get translated to Anthropic image blocks)
  // but NOT reasoning — Anthropic's native knob is `thinking.budget_tokens`,
  // distinct from OpenAI's `reasoning_effort`, and the proxy isn't known
  // to translate between them. Same story for Gemini 2.5+ / 3.x.
  // M29-D: Tavily-backed web search now applies to Claude / Gemini
  // too. reasoning + image_generation remain off (model-specific).
  it('claude family: vision + search yes, reasoning/imageGen no', () => {
    for (const m of [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1-20250805',
      'claude-3-5-haiku-20241022',
    ]) {
      const c = getModelCapabilities(m);
      expect(c.vision, `${m} vision`).toBe(true);
      expect(c.reasoning, `${m} reasoning`).toBe(false);
      expect(c.webSearch, `${m} webSearch`).toBe(true);
      expect(c.imageGeneration, `${m} imageGeneration`).toBe(false);
    }
  });

  it('gemini family: vision + search yes, reasoning/imageGen no', () => {
    for (const m of [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite-preview',
    ]) {
      const c = getModelCapabilities(m);
      expect(c.vision, `${m} vision`).toBe(true);
      expect(c.reasoning, `${m} reasoning`).toBe(false);
      expect(c.webSearch, `${m} webSearch`).toBe(true);
      expect(c.imageGeneration, `${m} imageGeneration`).toBe(false);
    }
  });
});

describe('modelRequiresResponsesApi', () => {
  it('forces Responses API for legacy -azure-suffixed models', () => {
    expect(modelRequiresResponsesApi('gpt-5.4-pro-azure')).toBe(true);
    expect(modelRequiresResponsesApi('gpt-5.5-azure')).toBe(true);
  });
  // M32-2.B-3: bare gpt-5.x names route via /v1/chat/completions; the
  // /v1/responses path is no longer driven by catalog metadata.
  it('does NOT force Responses API for bare gpt-5.x ids', () => {
    expect(modelRequiresResponsesApi('gpt-5.3-codex')).toBe(false);
    expect(modelRequiresResponsesApi('gpt-5.4')).toBe(false);
    expect(modelRequiresResponsesApi('gpt-5.4-pro')).toBe(false);
    expect(modelRequiresResponsesApi('gpt-5.5')).toBe(false);
  });
  it('does NOT force Responses API for std / foundry variants', () => {
    expect(modelRequiresResponsesApi('gpt-5.4__std')).toBe(false);
    expect(modelRequiresResponsesApi('gpt-5.4__foundry')).toBe(false);
    expect(modelRequiresResponsesApi('gpt-5.4-mini__std')).toBe(false);
  });
  it('leaves other models on Chat Completions by default', () => {
    expect(modelRequiresResponsesApi('gpt-5.4-mini')).toBe(false);
    expect(modelRequiresResponsesApi('deepseek-v3.5')).toBe(false);
    expect(modelRequiresResponsesApi(null)).toBe(false);
  });
});

describe('getValidReasoningEfforts', () => {
  it('returns empty for non-reasoning models', () => {
    expect(getValidReasoningEfforts('grok-4-fast')).toEqual([]);
    expect(getValidReasoningEfforts('deepseek-v3.5')).toEqual([]);
    expect(getValidReasoningEfforts(null)).toEqual([]);
  });

  it('returns all 5 tiers for standard OpenAI models', () => {
    expect(getValidReasoningEfforts('gpt-5.4')).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(getValidReasoningEfforts('gpt-5.5')).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(getValidReasoningEfforts('o4-mini')).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('drops minimal+low for -pro models (Azure-probed: 2026-05)', () => {
    // gpt-5.4-pro rejects 'low' and 'minimal' with HTTP 400.
    expect(getValidReasoningEfforts('gpt-5.4-pro')).toEqual([
      'medium',
      'high',
      'xhigh',
    ]);
    expect(getValidReasoningEfforts('gpt-5.4-pro-azure')).toEqual([
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('case-insensitive on the -pro detection', () => {
    expect(getValidReasoningEfforts('GPT-5.4-PRO')).toEqual([
      'medium',
      'high',
      'xhigh',
    ]);
  });
});
