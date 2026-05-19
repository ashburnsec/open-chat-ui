/**
 * M41 follow-up³ · AI 厂商/服务 图标库
 *
 * admin 在 /admin/models 可为每个 model_id 选一个 icon key (存
 * model_overrides.icon). 前端 VendorMonogram 渲染时优先看 override,
 * 没设就 fallback 老的 inferVendor() 启发式.
 *
 * 图标来源:
 *  - simple-icons (CC0-1.0): 大多数 vendor logo 走这个, tree-shake 友好
 *  - lucide-react: 语义图标 (video / image / brain / code) 给没专属 logo 的
 *  - letter monogram: 不存在 simple-icon 的 vendor 用 2 字符首字母
 *
 * Microsoft / Cohere / Stability / Midjourney / Runway / 腾讯 都没在
 * simple-icons 里 (实测), 改用 letter monogram + 品牌色背景, 视觉一致.
 */

import * as React from 'react';
import {
  siClaude,
  siGooglegemini,
  siGoogle,
  siMeta,
  siX,
  siDeepseek,
  siMistralai,
  siQwen,
  siMoonshotai,
  siPerplexity,
  siAlibabacloud,
  siHuggingface,
  siNvidia,
  siBaidu,
  siBytedance,
  siReplicate,
  siVercel,
  siGooglecloud,
  siApple,
} from 'simple-icons';
import { Brain, Code2, Image as ImageIcon, Sparkles, Video } from 'lucide-react';


export type AiIconKey =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'google'
  | 'meta'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'alibaba'
  | 'microsoft'
  | 'huggingface'
  | 'cohere'
  | 'nvidia'
  | 'baidu'
  | 'bytedance'
  | 'tencent'
  | 'stability'
  | 'midjourney'
  | 'runway'
  | 'replicate'
  | 'vercel'
  | 'apple'
  | 'gcp'
  | 'veo'
  | 'imagen'
  | 'gpt-image'
  | 'code'
  | 'sparkles'
  | 'brain'
  | 'default';

type LucideLike = React.ComponentType<
  React.SVGAttributes<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
>;

type IconRender =
  | { kind: 'simple-icon'; path: string }
  | { kind: 'lucide'; Icon: LucideLike }
  | { kind: 'letter'; letter: string };

export type AiIconDef = {
  key: AiIconKey;
  label: string;
  category: 'chat' | 'image' | 'video' | 'code' | 'cloud' | 'misc';
  bg: string;
  render: IconRender;
};

const BG = {
  openai: '#10a37f',
  anthropic: '#d97706',
  google: '#1a73e8',
  meta: '#0866ff',
  xai: '#0d0d0d',
  deepseek: '#4d6bfe',
  mistral: '#ff7000',
  qwen: '#615ced',
  moonshot: '#16a34a',
  perplexity: '#20808d',
  alibaba: '#ff6a00',
  microsoft: '#00a4ef',
  huggingface: '#ffd21e',
  cohere: '#39594d',
  nvidia: '#76b900',
  baidu: '#2932e1',
  bytedance: '#1f1f1f',
  tencent: '#0052d9',
  stability: '#7b3aed',
  midjourney: '#1c1c1c',
  runway: '#171717',
  replicate: '#262626',
  vercel: '#000000',
  apple: '#0d0d0d',
  veo: '#ef4444',
  imagen: '#06b6d4',
  gptImage: '#0ea5e9',
  code: '#171717',
  default: '#737373',
};

export const AI_ICONS: ReadonlyArray<AiIconDef> = [
  // — chat / general LLM
  { key: 'openai', label: 'OpenAI / GPT', category: 'chat', bg: BG.openai, render: { kind: 'lucide', Icon: Sparkles } },
  { key: 'anthropic', label: 'Anthropic / Claude', category: 'chat', bg: BG.anthropic, render: { kind: 'simple-icon', path: siClaude.path } },
  { key: 'gemini', label: 'Google Gemini', category: 'chat', bg: BG.google, render: { kind: 'simple-icon', path: siGooglegemini.path } },
  { key: 'google', label: 'Google', category: 'chat', bg: BG.google, render: { kind: 'simple-icon', path: siGoogle.path } },
  { key: 'meta', label: 'Meta / Llama', category: 'chat', bg: BG.meta, render: { kind: 'simple-icon', path: siMeta.path } },
  { key: 'xai', label: 'xAI / Grok', category: 'chat', bg: BG.xai, render: { kind: 'simple-icon', path: siX.path } },
  { key: 'deepseek', label: 'DeepSeek', category: 'chat', bg: BG.deepseek, render: { kind: 'simple-icon', path: siDeepseek.path } },
  { key: 'mistral', label: 'Mistral AI', category: 'chat', bg: BG.mistral, render: { kind: 'simple-icon', path: siMistralai.path } },
  { key: 'qwen', label: 'Qwen / 通义', category: 'chat', bg: BG.qwen, render: { kind: 'simple-icon', path: siQwen.path } },
  { key: 'moonshot', label: 'Moonshot / Kimi', category: 'chat', bg: BG.moonshot, render: { kind: 'simple-icon', path: siMoonshotai.path } },
  { key: 'perplexity', label: 'Perplexity', category: 'chat', bg: BG.perplexity, render: { kind: 'simple-icon', path: siPerplexity.path } },
  { key: 'baidu', label: '百度 / 文心', category: 'chat', bg: BG.baidu, render: { kind: 'simple-icon', path: siBaidu.path } },
  { key: 'bytedance', label: '字节 / 豆包', category: 'chat', bg: BG.bytedance, render: { kind: 'simple-icon', path: siBytedance.path } },
  { key: 'microsoft', label: 'Microsoft / Phi', category: 'chat', bg: BG.microsoft, render: { kind: 'letter', letter: 'MS' } },
  { key: 'cohere', label: 'Cohere', category: 'chat', bg: BG.cohere, render: { kind: 'letter', letter: 'Co' } },
  { key: 'tencent', label: '腾讯 / 混元', category: 'chat', bg: BG.tencent, render: { kind: 'letter', letter: 'Tx' } },

  // — image
  { key: 'gpt-image', label: 'GPT Image', category: 'image', bg: BG.gptImage, render: { kind: 'lucide', Icon: ImageIcon } },
  { key: 'imagen', label: 'Google Imagen', category: 'image', bg: BG.imagen, render: { kind: 'lucide', Icon: ImageIcon } },
  { key: 'stability', label: 'Stability AI / SD', category: 'image', bg: BG.stability, render: { kind: 'letter', letter: 'SD' } },
  { key: 'midjourney', label: 'Midjourney', category: 'image', bg: BG.midjourney, render: { kind: 'letter', letter: 'MJ' } },

  // — video
  { key: 'veo', label: 'Veo Video', category: 'video', bg: BG.veo, render: { kind: 'lucide', Icon: Video } },
  { key: 'runway', label: 'Runway', category: 'video', bg: BG.runway, render: { kind: 'letter', letter: 'RW' } },

  // — code
  { key: 'code', label: '代码 / Codex', category: 'code', bg: BG.code, render: { kind: 'lucide', Icon: Code2 } },

  // — cloud / platform
  { key: 'alibaba', label: '阿里云', category: 'cloud', bg: BG.alibaba, render: { kind: 'simple-icon', path: siAlibabacloud.path } },
  { key: 'huggingface', label: 'Hugging Face', category: 'cloud', bg: BG.huggingface, render: { kind: 'simple-icon', path: siHuggingface.path } },
  { key: 'nvidia', label: 'NVIDIA', category: 'cloud', bg: BG.nvidia, render: { kind: 'simple-icon', path: siNvidia.path } },
  { key: 'replicate', label: 'Replicate', category: 'cloud', bg: BG.replicate, render: { kind: 'simple-icon', path: siReplicate.path } },
  { key: 'vercel', label: 'Vercel', category: 'cloud', bg: BG.vercel, render: { kind: 'simple-icon', path: siVercel.path } },
  { key: 'gcp', label: 'Google Cloud', category: 'cloud', bg: BG.google, render: { kind: 'simple-icon', path: siGooglecloud.path } },
  { key: 'apple', label: 'Apple', category: 'cloud', bg: BG.apple, render: { kind: 'simple-icon', path: siApple.path } },

  // — semantic fallbacks
  { key: 'sparkles', label: '通用 ✨', category: 'misc', bg: BG.default, render: { kind: 'lucide', Icon: Sparkles } },
  { key: 'brain', label: '推理 / Thinking', category: 'misc', bg: BG.qwen, render: { kind: 'lucide', Icon: Brain } },
  { key: 'default', label: '默认 AI', category: 'misc', bg: BG.default, render: { kind: 'letter', letter: 'AI' } },
];

export function getAiIcon(key: string | null | undefined): AiIconDef | null {
  if (!key) return null;
  return AI_ICONS.find((i) => i.key === key) ?? null;
}

/** 渲染单个 AI icon — 给 admin picker / VendorMonogram 复用. */
export function AiIcon({
  iconKey,
  size = 24,
  className,
}: {
  iconKey: AiIconKey | string;
  size?: number;
  className?: string;
}) {
  const def = getAiIcon(iconKey) ?? getAiIcon('default')!;
  const inner = Math.round(size * 0.58);
  return (
    <span
      className={'inline-flex shrink-0 items-center justify-center rounded-full text-white ' + (className ?? '')}
      style={{ width: size, height: size, backgroundColor: def.bg }}
      aria-label={def.label}
      title={def.label}
    >
      {def.render.kind === 'simple-icon' ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={inner} height={inner} fill="currentColor">
          <path d={def.render.path} />
        </svg>
      ) : def.render.kind === 'lucide' ? (
        <def.render.Icon size={inner} strokeWidth={2.25} />
      ) : (
        <span className="font-semibold leading-none" style={{ fontSize: size <= 18 ? 9 : Math.round(size * 0.42) }}>
          {def.render.letter}
        </span>
      )}
    </span>
  );
}
