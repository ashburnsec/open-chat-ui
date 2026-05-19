import * as React from 'react';
import {
  siClaude,
  siAnthropic,
  siGooglegemini,
  siMeta,
  siDeepseek,
  siX,
  siMistralai,
  siQwen,
  siMoonshotai,
  siPerplexity,
  siAlibabacloud,
} from 'simple-icons';
import { Sparkles } from 'lucide-react';
import { AiIcon, type AiIconKey } from '@/lib/ai-icons';
import { cn } from '@/lib/utils';

/**
 * Vendor badge — colored disc with the vendor's official logo (or a
 * neutral fallback). SVG paths come from `simple-icons` (CC0-1.0), so
 * they're safe to ship; we tree-shake to only the vendors imported.
 *
 * OpenAI is intentionally NOT shipped via simple-icons (the project
 * dropped it after a TM concern), so we render `Sparkles` on a green
 * disc for any GPT-family model — visually evocative without using
 * the trademarked petal mark.
 *
 * Background colors come from CSS vars set per-vendor in globals.css
 * (M11-A) so they stay theme-aware in dark mode.
 */
export type VendorKey =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'meta'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'alibaba'
  | 'default';

export function inferVendor(model: string): VendorKey {
  // M29-B: drop the `__channel` suffix — vendor inference only cares
  // about the base model name. `gpt-5.4__foundry` is still OpenAI to
  // the user's eye even though it's served via Azure Foundry.
  const dunder = model.indexOf('__');
  const base = dunder === -1 ? model : model.slice(0, dunder);
  const m = base.toLowerCase();
  if (
    m.startsWith('gpt') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.includes('openai') ||
    m.startsWith('chatgpt')
  ) {
    return 'openai';
  }
  if (
    m.includes('claude') ||
    m.includes('haiku') ||
    m.includes('sonnet') ||
    m.includes('opus')
  ) {
    return 'anthropic';
  }
  if (m.startsWith('gemini') || m.includes('palm') || m.startsWith('imagen')) return 'google';
  if (m.startsWith('llama') || m.startsWith('meta')) return 'meta';
  if (m.startsWith('grok') || m.startsWith('xai')) return 'xai';
  if (m.startsWith('deepseek')) return 'deepseek';
  if (m.startsWith('mistral') || m.startsWith('codestral') || m.startsWith('pixtral')) {
    return 'mistral';
  }
  if (m.startsWith('qwen')) return 'qwen';
  if (m.startsWith('moonshot') || m.startsWith('kimi')) return 'moonshot';
  if (m.startsWith('perplexity') || m.startsWith('sonar')) return 'perplexity';
  if (m.startsWith('abab') || m.startsWith('minimax')) return 'alibaba';
  return 'default';
}

type LucideIconLike = React.ComponentType<
  React.SVGAttributes<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
>;

type VendorVisual =
  | { kind: 'simple-icons'; path: string; viewBox?: string }
  | { kind: 'lucide'; Icon: LucideIconLike }
  | { kind: 'monogram'; letter: string };

const VENDOR_VISUAL: Record<VendorKey, VendorVisual> = {
  openai: { kind: 'lucide', Icon: Sparkles },
  anthropic: { kind: 'simple-icons', path: siClaude.path },
  google: { kind: 'simple-icons', path: siGooglegemini.path },
  meta: { kind: 'simple-icons', path: siMeta.path },
  xai: { kind: 'simple-icons', path: siX.path },
  deepseek: { kind: 'simple-icons', path: siDeepseek.path },
  mistral: { kind: 'simple-icons', path: siMistralai.path },
  qwen: { kind: 'simple-icons', path: siQwen.path },
  moonshot: { kind: 'simple-icons', path: siMoonshotai.path },
  perplexity: { kind: 'simple-icons', path: siPerplexity.path },
  alibaba: { kind: 'simple-icons', path: siAlibabacloud.path },
  default: { kind: 'monogram', letter: 'AI' },
};

const VENDOR_BG_VAR: Record<VendorKey, string> = {
  openai: 'var(--color-brand-openai)',
  anthropic: 'var(--color-brand-anthropic)',
  google: 'var(--color-brand-google)',
  meta: 'var(--color-brand-meta)',
  xai: 'var(--color-brand-xai)',
  deepseek: 'var(--color-brand-deepseek)',
  mistral: 'var(--color-brand-mistral)',
  qwen: 'var(--color-brand-deepseek)',
  moonshot: 'var(--color-brand-default)',
  perplexity: 'var(--color-brand-google)',
  alibaba: 'var(--color-brand-mistral)',
  default: 'var(--color-brand-default)',
};

// `siAnthropic` is unused after we map "anthropic" to the Claude logo,
// but the named import is the simplest way to make sure tree-shaking
// pulls only what we need from `simple-icons`. Reference it once so
// linters don't warn — and so the import survives the build.
void siAnthropic;

/**
 * Render the vendor badge for a given model name.
 *
 * @param model The upstream model id (e.g. "gpt-5", "claude-sonnet-4-5")
 * @param size  Disc diameter in pixels. Inner logo is sized to ~58%.
 */
export function VendorMonogram({
  model,
  size = 20,
  className,
  iconOverride,
}: {
  model: string;
  size?: number;
  className?: string;
  /** M41 follow-up³: admin 可在 /admin/models 给单个模型选 icon key
   *  (model_overrides.icon → dynamic-catalog DynamicModel.icon). 传入
   *  时优先用 AI 图标库渲染, 否则 fallback 老的 inferVendor() 启发式. */
  iconOverride?: AiIconKey | string | null;
}) {
  if (iconOverride) {
    return <AiIcon iconKey={iconOverride} size={size} className={className} />;
  }
  const vendor = inferVendor(model);
  const visual = VENDOR_VISUAL[vendor];
  // Inner glyph scales with disc — ~58% leaves a comfortable padding.
  const inner = Math.round(size * 0.58);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: VENDOR_BG_VAR[vendor],
      }}
      aria-hidden
    >
      {visual.kind === 'simple-icons' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={inner}
          height={inner}
          fill="currentColor"
        >
          <path d={visual.path} />
        </svg>
      ) : visual.kind === 'lucide' ? (
        <visual.Icon size={inner} strokeWidth={2.25} />
      ) : (
        <span
          className="font-display font-semibold leading-none"
          style={{ fontSize: size <= 18 ? 9 : Math.round(size * 0.45) }}
        >
          {visual.letter}
        </span>
      )}
    </span>
  );
}
