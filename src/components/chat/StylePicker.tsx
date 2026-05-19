'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  IMAGE_STYLE_PRESETS,
  VIDEO_STYLE_PRESETS,
  type StyleKind,
  type StylePreset,
} from '@/lib/style-presets';

/**
 * M29-E: horizontal scroll of one-click style chips. Renders inside
 * ChatComposer when the user is in image- or video-generation mode.
 *
 * Selection toggles — clicking the active chip clears it (so users
 * can opt out without picking another). The chosen preset id lives on
 * `composerOpts.imageStyle` / `videoStyle`; ChatComposer applies the
 * prompt prefix at submit time.
 */
export function StylePicker({
  kind,
  value,
  onChange,
}: {
  kind: StyleKind;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations(`chat.style.${kind}`);
  const presets: readonly StylePreset[] =
    kind === 'image' ? IMAGE_STYLE_PRESETS : VIDEO_STYLE_PRESETS;
  return (
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1.5 scrollbar-thin">
      {presets.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(active ? null : p.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
              active
                ? 'border-ink bg-canvas-soft text-ink'
                : 'border-muted-foreground/15 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <span className="leading-none">{p.emoji}</span>
            <span>{t(p.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
