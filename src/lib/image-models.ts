/**
 * M36 补漏 · 一键生图 wizard 的"模型能力矩阵"单一真相源.
 *
 * 每个模型支持的 aspect ratio + tier 组合不一样, StepInputV2 的两级
 * resolution UI 从这里查能力, image-batch.ts 把用户选的 (aspect, tier)
 * 直接丢给 newapi 上游 (image_config 字段), 由 Vertex 自己 pick 出绝对
 * 像素尺寸. 不要在这个文件里维护"绝对像素 → tier" 的反向映射 — 客户端
 * 只需要展示用的尺寸预览, 真生图依赖上游解析.
 *
 * conv-svc 端有同源副本 services/image-models.ts (避免跨 package 依赖).
 * 改一处记得改另一处.
 */

export type ImageModelId =
  | 'gemini-2.5-flash-image' // Nano Banana
  | 'gemini-3-pro-image-preview' // Nano Banana Pro
  | 'gemini-3.1-flash-image-preview' // Nano Banana 2
  | 'gpt-image-2'; // OpenAI gpt-image-2 (M41 C2)

export type AspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9'
  | '1:4'
  | '4:1'
  | '1:8'
  | '8:1';

export type Tier = '0.5K' | '1K' | '1.5K' | '2K' | '4K';

/** M41 follow-up · OpenAI gpt-image-2 quality 档。Gemini 系不用此字段。 */
export type ImageQuality = 'low' | 'medium' | 'high';

export type ImageModelConfig = {
  id: ImageModelId;
  label: string;
  hint: string;
  aspects: AspectRatio[];
  /** 优先展示的常用 aspect, 其他折进 "更多". */
  popularAspects: AspectRatio[];
  tiers: Tier[];
  defaultAspect: AspectRatio;
  defaultTier: Tier;
  /** OpenAI gpt-image-2 系才设. 数组为空 / 未设代表"该模型不支持 quality 选择". */
  qualities?: ImageQuality[];
  defaultQuality?: ImageQuality;
};

export const IMAGE_MODELS: ReadonlyArray<ImageModelConfig> = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    hint: '中文海报神器, 价格友好, 仅 1K',
    aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    popularAspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    tiers: ['1K'],
    defaultAspect: '1:1',
    defaultTier: '1K',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    hint: '专业图像, 1K/2K/4K 全档',
    aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    popularAspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    tiers: ['1K', '2K', '4K'],
    defaultAspect: '1:1',
    defaultTier: '2K',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    hint: '最强档, 0.5K-4K + 14 个 aspect',
    aspects: [
      '1:1',
      '1:4',
      '1:8',
      '2:3',
      '3:2',
      '3:4',
      '4:1',
      '4:3',
      '4:5',
      '5:4',
      '8:1',
      '9:16',
      '16:9',
      '21:9',
    ],
    popularAspects: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
    tiers: ['0.5K', '1K', '2K', '4K'],
    defaultAspect: '1:1',
    defaultTier: '1K',
  },
  {
    // M41 C2 + follow-up: gpt-image-2 走 OpenAI /v1/images/generations.
    // 真实能力 (用户提供 + OpenAI 官方 + WebSearch 综合, 2026-04-21 发布):
    // - 1.5K (1536×1024 base) / 2K (2560×1440) / 4K (3840×2160, 实验性)
    // - 5 比例: 3:2 (默认) / 1:1 / 2:3 / 16:9 / 9:16
    // - 3 质量档: low / medium / high (默认 high)
    // - 强项: 多语言文字渲染 / 透明背景 / 电商商品图
    // - 上游配额贵 ($30/1M output token, 大致 $0.04-0.40/张 视档位)
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    hint: '中英文字精准 + 透明背景 (OpenAI), 1.5K-4K, 3 质量档',
    aspects: ['1:1', '3:2', '2:3', '16:9', '9:16'],
    popularAspects: ['3:2', '1:1', '2:3', '16:9'],
    tiers: ['1.5K', '2K', '4K'],
    defaultAspect: '3:2',
    defaultTier: '1.5K',
    qualities: ['low', 'medium', 'high'],
    defaultQuality: 'high',
  },
];

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gemini-2.5-flash-image';

export function findImageModel(id: string): ImageModelConfig | null {
  return IMAGE_MODELS.find((m) => m.id === id) ?? null;
}

/**
 * 给定 model + aspect + tier, 返回 UI 预览用的绝对像素 {w, h}. 数据来自
 * 用户提供的官方矩阵; 不直接送给上游, 只用于 StepInputV2 底部 "最终 X×Y"
 * 提示. 找不到组合时 fallback 到 1024×1024.
 *
 * Banana 1 / Pro / 2 共享 aspect→base 像素表 (1K), 不同 tier 是相同
 * aspect 的 2× / 4× 倍率扩展; 0.5K = 1K 的 1/2 (Banana 2 独占).
 */
const ASPECT_BASE_1K: Record<AspectRatio, [number, number]> = {
  '1:1': [1024, 1024],
  '2:3': [832, 1248],
  '3:2': [1248, 832],
  '3:4': [864, 1184],
  '4:3': [1184, 864],
  '4:5': [896, 1152],
  '5:4': [1152, 896],
  '9:16': [768, 1344],
  '16:9': [1344, 768],
  '21:9': [1536, 672],
  '1:4': [384, 1536],
  '4:1': [1536, 384],
  '1:8': [192, 1536],
  '8:1': [1536, 192],
};

const TIER_MULT: Record<Tier, number> = {
  '0.5K': 0.5,
  '1K': 1,
  '1.5K': 1.5,
  '2K': 2,
  '4K': 4,
};

export function resolveResolution(
  aspect: AspectRatio,
  tier: Tier,
): { w: number; h: number } {
  const base = ASPECT_BASE_1K[aspect];
  if (!base) return { w: 1024, h: 1024 };
  const mult = TIER_MULT[tier] ?? 1;
  return {
    w: Math.round(base[0] * mult),
    h: Math.round(base[1] * mult),
  };
}

/**
 * Hydrate 兜底 — 老对话只存了 resolution string ('1024x1024'), 用这个
 * 函数派生 (aspect, tier). 默认 1:1 / 1K (Nano Banana 第一版唯一支持的组合).
 */
export function legacyResolutionToAspectTier(
  resolution: string | null | undefined,
): { aspect: AspectRatio; tier: Tier } {
  if (!resolution) return { aspect: '1:1', tier: '1K' };
  const m = resolution.match(/^(\d+)x(\d+)$/);
  if (!m) return { aspect: '1:1', tier: '1K' };
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return { aspect: '1:1', tier: '1K' };
  // 老 resolution 列表只有 1024x1024 / 1792x1024 / 1024x1792 三种.
  if (w === h) return { aspect: '1:1', tier: '1K' };
  if (w > h) return { aspect: '16:9', tier: '1K' };
  return { aspect: '9:16', tier: '1K' };
}
