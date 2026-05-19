'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { resolveModelId, type ModelCategory } from '@/lib/models-catalog';
import { loadDynamicCatalog, visibleModels, type DynamicModel } from '@/lib/dynamic-catalog';

const MODEL_PREF_KEY = 'cp:last-model';
const MODEL_CHANGED_EVENT = 'cp:model-changed';

/** Filter tabs at the top — competitor-style horizontal chip row. */
type FilterKey = 'all' | ModelCategory;

const FILTERS: ReadonlyArray<{ key: FilterKey; labelKey: string; emoji: string }> = [
  { key: 'all', labelKey: 'all', emoji: '🌐' },
  { key: 'chat', labelKey: 'chat', emoji: '💬' },
  { key: 'image', labelKey: 'image', emoji: '🎨' },
  { key: 'video', labelKey: 'video', emoji: '🎬' },
  { key: 'audio', labelKey: 'audio', emoji: '🔊' },
];

/**
 * M29-I: redesigned model library — competitor-style horizontal filter
 * chips at the top, larger model cards (icon + name + description +
 * multi-source badge) below. Replaces the M29-C collapsible category
 * tree, which got too dense once the catalog grew past ~40 entries.
 *
 * Sidebar layout (260 px wide):
 *   ┌ search box                 ┐
 *   ├ filter chips (5 categories)│
 *   │ ┌ model card               │
 *   │ │ [icon]  Display name [N源]
 *   │ │         60-80 字描述...   │
 *   │ │         (description)    │
 *   │ └                          │
 *   │ … (vertical scroll)        │
 *   └                            ┘
 *
 * Selection bus is unchanged — clicking a card writes
 * `cp:last-model` and dispatches `cp:model-changed`. ChatPanel listens
 * and updates its current-model state.
 */
export function ModelLibrary() {
  const t = useTranslations('sidebar.modelLibrary');
  const tCat = useTranslations('sidebar.modelCategory');
  const [catalog, setCatalog] = useState<DynamicModel[] | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDynamicCatalog().then((entries) => {
      if (!cancelled) setCatalog(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_PREF_KEY);
    if (saved) setCurrentId(resolveModelId(saved));
    function onChange(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string') setCurrentId(id);
    }
    window.addEventListener(MODEL_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MODEL_CHANGED_EVENT, onChange);
  }, []);

  const visible = useMemo(() => {
    if (!catalog) return [];
    const enabled = visibleModels(catalog);
    const q = search.trim().toLowerCase();
    return enabled.filter((m) => {
      if (filter !== 'all' && m.category !== filter) return false;
      if (!q) return true;
      const hay = `${m.displayName} ${m.description} ${m.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, search, filter]);

  function pick(id: string) {
    window.localStorage.setItem(MODEL_PREF_KEY, id);
    setCurrentId(id);
    window.dispatchEvent(new CustomEvent(MODEL_CHANGED_EVENT, { detail: id }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 px-3 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-xs outline-none transition-colors focus:border-primary"
          />
        </div>
        {/* M30: horizontal scroll keeps the 5 filter chips on a single
         *  row inside the narrow mobile sheet (320 px). Desktop sidebar
         *  has the room and stays as a normal wrap row. */}
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] transition-colors',
                  active
                    ? 'bg-accent text-primary font-medium'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                <span className="leading-none">{f.emoji}</span>
                <span>{tCat(f.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
        {catalog === null ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('loading')}</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{t('noMatch')}</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                isActive={m.id === currentId}
                onPick={pick}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  isActive,
  onPick,
}: {
  model: DynamicModel;
  isActive: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(model.id)}
        className={cn(
          'flex w-full items-start gap-2 rounded-lg border p-2 text-left text-xs transition-colors duration-150',
          isActive
            ? 'border-primary/40 bg-accent'
            : 'border-transparent bg-card hover:border-border hover:bg-card/80',
        )}
      >
        <div className="mt-0.5 shrink-0">
          <VendorMonogram model={model.id} size={28} iconOverride={model.icon} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'truncate text-sm font-medium',
                isActive && 'text-primary',
              )}
            >
              {model.displayName}
            </span>
            {isActive && <Check className="h-3 w-3 shrink-0 text-primary" />}
          </div>
          {model.description && (
            <p className="line-clamp-3 text-[11px] leading-snug text-muted-foreground">
              {model.description}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

export const SIDEBAR_MODEL_PREF_KEY = MODEL_PREF_KEY;
export const SIDEBAR_MODEL_CHANGED_EVENT = MODEL_CHANGED_EVENT;
