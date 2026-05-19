/**
 * M29-E · Style chip presets for image / video generation.
 *
 * Used by ChatComposer to surface a horizontal scroll of one-click
 * style options when the user is in an image- or video-generation
 * model. Picking a chip sets `composerOpts.imageStyle` /
 * `composerOpts.videoStyle`, which gets folded into the prompt
 * prefix at submit time.
 *
 * Prefix format: short English-led phrasing (most upstream models
 * understand English style cues better than zh) capped under 40
 * chars to leave headroom for the user's actual prompt + the 80-token
 * cap on gemini-*-image-preview.
 */

export type StyleKind = 'image' | 'video';

export type StylePreset = {
  id: string;
  /** i18n key under `chat.style.{kind}.{id}`. */
  labelKey: string;
  emoji: string;
  /** Prepended (with ", ") to the user's prompt. */
  promptPrefix: string;
};

/** 12 image generation styles. */
export const IMAGE_STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'realistic', labelKey: 'realistic', emoji: '📷', promptPrefix: 'photorealistic, high detail, natural lighting' },
  { id: 'anime', labelKey: 'anime', emoji: '🎌', promptPrefix: 'anime style, vibrant colors, clean line art' },
  { id: 'oil', labelKey: 'oil', emoji: '🖼️', promptPrefix: 'oil painting, classical art style, visible brush strokes' },
  { id: 'watercolor', labelKey: 'watercolor', emoji: '🎨', promptPrefix: 'watercolor painting, soft pastel tones, paper texture' },
  { id: 'pixel', labelKey: 'pixel', emoji: '👾', promptPrefix: 'pixel art, 8-bit retro gaming aesthetic' },
  { id: '3d', labelKey: '3d', emoji: '🧊', promptPrefix: '3D rendered, octane render, cinematic lighting' },
  { id: 'cyberpunk', labelKey: 'cyberpunk', emoji: '🌃', promptPrefix: 'cyberpunk, neon lights, futuristic city' },
  { id: 'minimal', labelKey: 'minimal', emoji: '⬜', promptPrefix: 'minimalist design, clean lines, white background' },
  { id: 'chinese', labelKey: 'chinese', emoji: '🏮', promptPrefix: '中国画风格，水墨写意，留白构图' },
  { id: 'poster', labelKey: 'poster', emoji: '🪧', promptPrefix: 'poster design, bold typography, graphic layout' },
  { id: 'doodle', labelKey: 'doodle', emoji: '✏️', promptPrefix: 'hand-drawn doodle, sketch style, playful' },
  { id: 'steampunk', labelKey: 'steampunk', emoji: '⚙️', promptPrefix: 'steampunk, brass gears, victorian aesthetic' },
];

/** 6 video generation styles. */
export const VIDEO_STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'cinematic', labelKey: 'cinematic', emoji: '🎬', promptPrefix: 'cinematic, film grain, anamorphic lens, dramatic lighting' },
  { id: 'anime', labelKey: 'anime', emoji: '🎌', promptPrefix: 'anime style animation, smooth motion, vibrant colors' },
  { id: 'vlog', labelKey: 'vlog', emoji: '📹', promptPrefix: 'vlog style, handheld camera, natural daylight' },
  { id: 'ad', labelKey: 'ad', emoji: '📺', promptPrefix: 'commercial advertisement, polished, dynamic camera moves' },
  { id: 'documentary', labelKey: 'documentary', emoji: '🎥', promptPrefix: 'documentary style, observational, realistic, fly-on-the-wall' },
  { id: 'fashion', labelKey: 'fashion', emoji: '👗', promptPrefix: 'fashion editorial shoot, dramatic lighting, slow motion' },
];

export function findStylePreset(
  kind: StyleKind,
  id: string | null | undefined,
): StylePreset | undefined {
  if (!id) return undefined;
  const list = kind === 'image' ? IMAGE_STYLE_PRESETS : VIDEO_STYLE_PRESETS;
  return list.find((p) => p.id === id);
}

/**
 * Compose the final prompt by prepending a style prefix when one is
 * selected. The user's text wins on conflict — the prefix sits in
 * front so the model treats it as a stylistic modifier, not a
 * subject. Returns the raw user text untouched when no preset.
 */
export function applyStylePrefix(
  prompt: string,
  preset: StylePreset | undefined,
): string {
  if (!preset || !prompt.trim()) return prompt;
  return `${preset.promptPrefix}, ${prompt}`;
}
