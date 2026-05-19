'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Loader2, Pencil, Plus, Search, Sparkles, Tag, Trash2,
  PenLine, Code2, Languages, GraduationCap, ChefHat, Image,
  Briefcase, Scale, HeartPulse, TrendingUp, Wand2, LayoutGrid,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/use-confirm';
import { getPreferredModel } from '@/lib/preferred-model';
import { filterChatModels } from '@/lib/chat-models';
import { loadDynamicCatalog, visibleModels } from '@/lib/dynamic-catalog';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { cn } from '@/lib/utils';

/**
 * M43-Prompts-Library · 重构自旧 AgentsPanel.
 * 视觉: 圆 avatar + 名字 + tag chip + hover 浮起 (Apple Stickers / Discord 风).
 * 数据: agents 表新增 tags / locale / source / name_en / description_en /
 *   system_prompt_en (migration 0021). source='curated' 来源 prompts.chat
 *   (CC0) 的 LLM 双语化精选; source='system' 是 M13/M29 预置; source='user'
 *   是用户私有.
 */
export type Agent = {
  id: number;
  user_id: number | null;
  slug: string;
  name: string;
  avatar: string;
  system_prompt: string;
  default_model: string | null;
  default_params: import('@/lib/conv').ConversationDefaultParams | null;
  category: string;
  description: string | null;
  sort_order: number;
  is_system: boolean;
  editable: boolean;
  flow_type?: 'chat' | 'workflow';
  flow_config?: Record<string, unknown> | null;
  // M43
  tags?: string[];
  locale?: 'zh' | 'en' | 'multi';
  source?: 'system' | 'curated' | 'user';
  name_en?: string | null;
  description_en?: string | null;
  system_prompt_en?: string | null;
};

const CATEGORY_KEYS = [
  'all',
  'writing',
  'coding',
  'learning',
  'life',
  'productivity',
  'creative',
  'legal',
  'health',
  'finance',
  'mysticism',
  'other',
] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

type SortKey = 'popular' | 'recent' | 'alphabetical';
type TabKey = 'all' | 'mine';

const MODEL_PREF_KEY = 'cp:last-model';
const TOP_TAG_COUNT = 15;

export function PromptsLibrary() {
  const t = useTranslations('agents');
  const tLib = useTranslations('promptsLibrary');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<Agent[] | null>(null);
  const [tagCloud, setTagCloud] = useState<{ tag: string; count: number }[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryKey>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('popular');
  const [tab, setTab] = useState<TabKey>('all');
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  async function load() {
    try {
      const [agentsRes, tagsRes] = await Promise.all([
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/agents/tags', { cache: 'no-store' }),
      ]);
      const aj = await agentsRes.json();
      const tj = await tagsRes.json();
      if (aj?.success && Array.isArray(aj.data?.items)) {
        setItems(aj.data.items as Agent[]);
      } else {
        toast.error(t('loadFailed'));
        setItems([]);
      }
      if (tj?.success && Array.isArray(tj.data?.items)) {
        setTagCloud(tj.data.items as { tag: string; count: number }[]);
      }
    } catch {
      toast.error(t('loadFailed'));
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const catalog = await loadDynamicCatalog();
        const ids = visibleModels(catalog).map((m) => m.id);
        const chat = filterChatModels(ids);
        setModels(chat);
        const last = typeof window !== 'undefined' ? window.localStorage.getItem(MODEL_PREF_KEY) : null;
        if (last && chat.includes(last)) setSelectedModel(last);
        else if (chat.length > 0) setSelectedModel(chat[0]);
      } catch {
        /* picker 留空 */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedModel && typeof window !== 'undefined') {
      window.localStorage.setItem(MODEL_PREF_KEY, selectedModel);
    }
  }, [selectedModel]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const ql = q.trim().toLowerCase();
    const arr = items.filter((a) => {
      if (a.flow_type === 'workflow') return false;
      if (tab === 'mine' && a.user_id === null) return false;
      if (tab === 'all' && a.user_id !== null) return false;
      if (cat !== 'all' && a.category !== cat) return false;
      if (tagFilter && !(a.tags ?? []).includes(tagFilter)) return false;
      if (!ql) return true;
      return (
        a.name.toLowerCase().includes(ql) ||
        (a.description ?? '').toLowerCase().includes(ql) ||
        (a.name_en ?? '').toLowerCase().includes(ql) ||
        (a.description_en ?? '').toLowerCase().includes(ql) ||
        (a.tags ?? []).some((t) => t.toLowerCase().includes(ql))
      );
    });
    if (sort === 'recent') {
      arr.sort((a, b) => b.id - a.id);
    } else if (sort === 'alphabetical') {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'popular' 已被后端 sort_order DESC 排好, 不再二次排.
    return arr;
  }, [items, q, cat, tagFilter, sort, tab]);

  async function startChat(agent: Agent) {
    setBusy(agent.id);
    try {
      const model = selectedModel ?? (await getPreferredModel());
      if (!model) throw new Error(t('startChatFailed'));
      const body: Record<string, unknown> = {
        agent_id: agent.id,
        model,
        title: agent.name,
      };
      const r = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j?.success || !j.data?.id) {
        throw new Error(j?.message || t('startChatFailed'));
      }
      // M43: 埋点 — 让"最热"排序反映真实使用
      void fetch(`/api/agents/${encodeURIComponent(agent.slug)}/use`, {
        method: 'POST',
      }).catch(() => undefined);
      // M43 follow-up: sidebar ModelLibrary 在 layout 里挂载一次不 remount;
      // 跳新对话前 dispatch cp:model-changed 让侧栏勾上正确的模型 (跟用户在
      // /agents 顶部 picker 选的一致). 写 localStorage 是兜底 (下次 mount 用).
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MODEL_PREF_KEY, model);
        window.dispatchEvent(new CustomEvent('cp:model-changed', { detail: model }));
      }
      router.push(`/c/${j.data.id}` as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('startChatFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(agent: Agent) {
    if (!agent.editable) return;
    const ok = await confirm({
      title: t('deleteConfirmTitle'),
      description: t('deleteConfirm', { name: agent.name }),
      confirmLabel: tCommon('delete'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agent.slug)}`, {
        method: 'DELETE',
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('deleteFailed'));
      toast.success(t('deleted'));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
  }

  const displayedTags = tagsExpanded ? tagCloud : tagCloud.slice(0, TOP_TAG_COUNT);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      {/* 标题 + 创建按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{tLib('title')}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{tLib('subtitle')}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-[13px]">
          <Link href={'/agents/new' as never}>
            <Plus className="h-3.5 w-3.5" /> {t('create')}
          </Link>
        </Button>
      </div>

      {/* Tabs: 所有 / 我的 */}
      <div className="flex gap-0.5 border-b border-border">
        {(['all', 'mine'] as TabKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === k
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tLib(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {/* 工具栏：搜索 + 排序 + 模型 picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors hover:border-foreground/30"
        >
          <option value="popular">{tLib('sort.popular')}</option>
          <option value="recent">{tLib('sort.recent')}</option>
          <option value="alphabetical">{tLib('sort.alphabetical')}</option>
        </select>
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]">
          <span className="text-muted-foreground">{t('startWithModel')}</span>
          <ModelPicker value={selectedModel} options={models} onChange={setSelectedModel} />
        </div>
      </div>

      {/* 分类 chip 行 */}
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
        {CATEGORY_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setCat(k)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium transition-all duration-150',
              cat === k
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {t(`categories.${k}`)}
          </button>
        ))}
      </div>

      {/* tag 云 */}
      {tagCloud.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              <Tag className="h-3 w-3" />
              {tLib('tagCloud')}
            </span>
            {tagCloud.length > TOP_TAG_COUNT && (
              <button
                type="button"
                onClick={() => setTagsExpanded((v) => !v)}
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                {tagsExpanded ? tLib('collapseTags') : tLib('expandTags')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className="rounded-full border border-foreground bg-foreground px-2.5 py-0.5 text-[11px] text-background"
              >
                #{tagFilter} ×
              </button>
            )}
            {displayedTags.map((tagItem) => (
              <button
                key={tagItem.tag}
                type="button"
                onClick={() => setTagFilter(tagItem.tag === tagFilter ? null : tagItem.tag)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] transition-all duration-150',
                  tagItem.tag === tagFilter
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                )}
              >
                #{tagItem.tag} <span className="opacity-50">{tagItem.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards grid */}
      {filtered === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-xl border border-border p-4">
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-14 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Sparkles className="h-5 w-5 opacity-40" />
          <p>{tab === 'mine' ? tLib('mineEmpty') : tLib('noResults')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((a) => (
            <PromptCard
              key={a.id}
              agent={a}
              busy={busy === a.id}
              onStart={() => startChat(a)}
              onDelete={() => remove(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Icon + colour mapping ────────────────────────────────────────────
// Maps category (or slug prefix) → { Icon, bg, fg } for the avatar tile.
// bg/fg are raw Tailwind utility strings so they work in dark mode via
// the design-token layer already defined in globals.css.

type IconSpec = {
  Icon: React.ComponentType<{ className?: string }>;
  bg: string;   // background
  fg: string;   // icon colour
};

const SLUG_ICON: Record<string, IconSpec> = {
  'wf-one-click-image': { Icon: Image,       bg: 'bg-violet-100 dark:bg-violet-950', fg: 'text-violet-600 dark:text-violet-400' },
};

const CATEGORY_ICON: Record<string, IconSpec> = {
  writing:      { Icon: PenLine,      bg: 'bg-blue-100 dark:bg-blue-950',    fg: 'text-blue-600 dark:text-blue-400'    },
  coding:       { Icon: Code2,        bg: 'bg-green-100 dark:bg-green-950',  fg: 'text-green-600 dark:text-green-400'  },
  learning:     { Icon: GraduationCap,bg: 'bg-amber-100 dark:bg-amber-950',  fg: 'text-amber-600 dark:text-amber-400'  },
  life:         { Icon: ChefHat,      bg: 'bg-orange-100 dark:bg-orange-950',fg: 'text-orange-600 dark:text-orange-400'},
  productivity: { Icon: Briefcase,    bg: 'bg-sky-100 dark:bg-sky-950',      fg: 'text-sky-600 dark:text-sky-400'      },
  creative:     { Icon: Wand2,        bg: 'bg-pink-100 dark:bg-pink-950',    fg: 'text-pink-600 dark:text-pink-400'    },
  legal:        { Icon: Scale,        bg: 'bg-slate-100 dark:bg-slate-800',  fg: 'text-slate-600 dark:text-slate-400'  },
  health:       { Icon: HeartPulse,   bg: 'bg-rose-100 dark:bg-rose-950',    fg: 'text-rose-600 dark:text-rose-400'    },
  finance:      { Icon: TrendingUp,   bg: 'bg-emerald-100 dark:bg-emerald-950',fg:'text-emerald-600 dark:text-emerald-400'},
  mysticism:    { Icon: Sparkles,     bg: 'bg-purple-100 dark:bg-purple-950',fg: 'text-purple-600 dark:text-purple-400'},
  other:        { Icon: LayoutGrid,   bg: 'bg-zinc-100 dark:bg-zinc-800',    fg: 'text-zinc-500 dark:text-zinc-400'    },
  // slug starts with 'sys-translator' override
  translation:  { Icon: Languages,    bg: 'bg-teal-100 dark:bg-teal-950',    fg: 'text-teal-600 dark:text-teal-400'    },
};

function resolveIconSpec(agent: Agent): IconSpec {
  if (SLUG_ICON[agent.slug]) return SLUG_ICON[agent.slug];
  // tag-based override: 'translation' tag → translation icon
  if (agent.tags?.includes('translation')) return CATEGORY_ICON.translation;
  return CATEGORY_ICON[agent.category] ?? { Icon: Bot, bg: 'bg-muted', fg: 'text-muted-foreground' };
}

// ── PromptCard ───────────────────────────────────────────────────────

function PromptCard({
  agent,
  busy,
  onStart,
  onDelete,
}: {
  agent: Agent;
  busy: boolean;
  onStart: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('agents');
  const chips = agent.tags && agent.tags.length > 0 ? agent.tags.slice(0, 2) : [agent.category];
  const { Icon, bg, fg } = resolveIconSpec(agent);

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      className={cn(
        'group relative flex flex-col items-start gap-3 rounded-xl border border-border bg-background p-3.5 text-left',
        'transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[var(--shadow-3)]',
        busy && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Avatar 行 */}
      <div className="flex w-full items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', bg)}>
          {busy
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : <Icon className={cn('h-5 w-5', fg)} strokeWidth={1.75} />
          }
        </div>
        {/* 编辑/删除操作 — hover 显 */}
        {agent.editable && (
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Link
              href={`/agents/${encodeURIComponent(agent.slug)}/edit` as never}
              onClick={(e) => e.stopPropagation()}
              aria-label={t('edit')}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </Link>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label={t('delete')}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* 名字 + 描述 */}
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="line-clamp-1 text-[13px] font-semibold leading-tight text-foreground">
          {agent.name}
        </h3>
        {agent.description && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {agent.description}
          </p>
        )}
      </div>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-1">
        {chips.map((tg) => (
          <span
            key={tg}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {tg}
          </span>
        ))}
      </div>
    </button>
  );
}
