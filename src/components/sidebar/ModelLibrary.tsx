'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Check, MessageSquare, Image, Video, Music, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { resolveModelId, type ModelCategory } from '@/lib/models-catalog';
import { loadDynamicCatalog, visibleModels, type DynamicModel } from '@/lib/dynamic-catalog';

const MODEL_PREF_KEY = 'cp:last-model';
const MODEL_CHANGED_EVENT = 'cp:model-changed';

type FilterKey = 'all' | ModelCategory;

const FILTERS: ReadonlyArray<{
  key: FilterKey;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'all',   labelKey: 'all',   Icon: Globe },
  { key: 'chat',  labelKey: 'chat',  Icon: MessageSquare },
  { key: 'image', labelKey: 'image', Icon: Image },
  { key: 'video', labelKey: 'video', Icon: Video },
  { key: 'audio', labelKey: 'audio', Icon: Music },
];

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
    return () => { cancelled = true; };
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

  // Group visible models by category for section headers
  const sections = useMemo(() => {
    if (filter !== 'all') return null;
    const order: ModelCategory[] = ['chat', 'image', 'video', 'audio'];
    const byCategory = new Map<ModelCategory, DynamicModel[]>();
    for (const m of visible) {
      const cat = (m.category ?? 'chat') as ModelCategory;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(m);
    }
    return order
      .filter((c) => byCategory.has(c))
      .map((c) => ({ category: c, models: byCategory.get(c)! }));
  }, [visible, filter]);

  return (
    <div className="flex h-full flex-col gap-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {t('title')}
        </p>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none transition-all focus:border-foreground/30 focus:ring-0"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-px overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const Icon = f.Icon;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] font-medium transition-all duration-150',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{tCat(f.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-border" />

      {/* Model list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
        {catalog === null ? (
          <div className="flex flex-col gap-2 px-1 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg p-2">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{t('noMatch')}</p>
        ) : sections ? (
          // Grouped by category
          <div className="space-y-3">
            {sections.map(({ category, models }) => (
              <div key={category}>
                <CategoryLabel category={category} tCat={tCat} />
                <ul className="space-y-px">
                  {models.map((m) => (
                    <ModelCard key={m.id} model={m} isActive={m.id === currentId} onPick={pick} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          // Flat list (filtered)
          <ul className="space-y-px">
            {visible.map((m) => (
              <ModelCard key={m.id} model={m} isActive={m.id === currentId} onPick={pick} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const CATEGORY_LABEL_MAP: Record<ModelCategory, string> = {
  chat: '对话',
  code: '编程',
  image: '图像',
  video: '视频',
  audio: '音频',
};

function CategoryLabel({
  category,
  tCat,
}: {
  category: ModelCategory;
  tCat: (key: string) => string;
}) {
  const label = tCat(category) || CATEGORY_LABEL_MAP[category] || category;
  return (
    <div className="mb-1 flex items-center gap-2 px-2 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        {label}
      </span>
      <div className="h-px flex-1 bg-border/60" />
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
          'group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-all duration-150',
          isActive
            ? 'bg-foreground text-background'
            : 'text-foreground hover:bg-accent',
        )}
      >
        {/* Vendor icon */}
        <div className="shrink-0">
          <VendorMonogram
            model={model.id}
            size={26}
            iconOverride={model.icon}
          />
        </div>

        {/* Name + description */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-1">
            <span className={cn('truncate text-[13px] font-medium leading-tight')}>
              {model.displayName}
            </span>
            {isActive && (
              <Check
                className="h-3 w-3 shrink-0 opacity-80"
                strokeWidth={2.5}
              />
            )}
          </div>
          {model.description && (
            <p
              className={cn(
                'mt-0.5 line-clamp-1 text-[11px] leading-snug',
                isActive ? 'text-background/60' : 'text-muted-foreground',
              )}
            >
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
