'use client';

import { Fragment, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { findModelEntry, type ModelEntry, type ModelVendor } from '@/lib/models-catalog';
import { useDynamicCatalog, findEntry as findDynamic } from '@/lib/dynamic-catalog';
import { cn } from '@/lib/utils';

const VENDOR_LABEL: Record<ModelVendor, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  microsoft: 'Microsoft',
  meta: 'Meta',
  xai: 'xAI',
  moonshot: 'Moonshot',
  deepseek: 'DeepSeek',
  azure: 'Azure',
  unknown: '其他',
};

const VENDOR_ORDER: ModelVendor[] = [
  'openai',
  'anthropic',
  'google',
  'azure',
  'deepseek',
  'moonshot',
  'xai',
  'mistral',
  'microsoft',
  'meta',
  'unknown',
];

/**
 * Groups options by catalog `vendor`. Each item renders just the
 * displayName — post M32-2.B model ids are bare and the abilities
 * table RR's across channels, so there's no source-picker UX needed.
 *
 * Synthesised entries (model id not in catalog) fall back to a generic
 * "unknown" group rather than disappear — admins adding a new model
 * still see it pre-catalog update.
 */
export function ModelPicker({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: string[];
  onChange: (m: string) => void;
}) {
  const t = useTranslations('chat.modelPicker');
  const otherLabel = t('vendorOther');
  // M34: prefer the merged dynamic catalog (admin overrides win) when
  // available; falls back to the hardcode catalog so the picker has
  // labels even before the first dynamic load resolves.
  const dynamicCatalog = useDynamicCatalog();

  function entryFor(id: string): ModelEntry {
    const dyn = findDynamic(dynamicCatalog, id);
    if (dyn) {
      return {
        id: dyn.id,
        displayName: dyn.displayName,
        vendor: dyn.vendor,
        category: dyn.category,
        description: dyn.description,
        vision: dyn.vision,
      };
    }
    return findModelEntry(id) ?? synth(id);
  }

  const selected = useMemo(
    () => (value ? entryFor(value) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, dynamicCatalog],
  );

  const groups = useMemo(() => {
    const buckets = new Map<ModelVendor, ModelEntry[]>();
    for (const id of options) {
      const entry = entryFor(id);
      const arr = buckets.get(entry.vendor) ?? [];
      arr.push(entry);
      buckets.set(entry.vendor, arr);
    }
    return VENDOR_ORDER.filter((v) => buckets.has(v)).map((v) => ({
      vendor: v,
      label: v === 'unknown' ? otherLabel : VENDOR_LABEL[v],
      items: buckets.get(v)!,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, otherLabel, dynamicCatalog]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-[13px] font-medium text-foreground transition-all hover:bg-accent hover:border-foreground/25"
        >
          {selected ? (
            <VendorMonogram
              model={selected.id}
              size={16}
              iconOverride={findDynamic(dynamicCatalog, selected.id)?.icon}
            />
          ) : (
            <span className="inline-block h-4 w-4 rounded-full bg-muted" />
          )}
          <span className="max-w-[120px] truncate">
            {selected
              ? selected.displayName
              : options.length
                ? t('pick')
                : t('empty')}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[420px] w-[280px] overflow-y-auto">
        {groups.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-muted-foreground">{t('adminHint')}</div>
        ) : (
          groups.map((g, i) => (
            <Fragment key={g.vendor}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {g.label}
              </DropdownMenuLabel>
              {g.items.map((it) => {
                const active = it.id === value;
                return (
                  <DropdownMenuItem
                    key={it.id}
                    onSelect={() => onChange(it.id)}
                    className={cn(
                      'gap-2 text-[13px]',
                      active && 'bg-accent font-medium',
                    )}
                  >
                    <VendorMonogram
                      model={it.id}
                      size={16}
                      iconOverride={findDynamic(dynamicCatalog, it.id)?.icon}
                    />
                    <span className="flex-1 truncate">{it.displayName}</span>
                    {active && <Check className="h-3 w-3 shrink-0 text-foreground" />}
                  </DropdownMenuItem>
                );
              })}
            </Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function synth(id: string): ModelEntry {
  return {
    id,
    displayName: id,
    vendor: 'unknown',
    category: 'chat',
    description: '',
  };
}
