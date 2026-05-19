'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Search, Sparkles, Tag, Trash2 } from 'lucide-react';
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
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      {/* 标题 + 创建按钮 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{tLib('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tLib('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href={'/agents/new' as never}>
            <Plus className="h-4 w-4" /> {t('create')}
          </Link>
        </Button>
      </div>

      {/* Tabs: 所有 / 我的 */}
      <div className="flex gap-1 border-b border-border">
        {(['all', 'mine'] as TabKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              tab === k
                ? 'border-ink text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tLib(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {/* 模型 picker */}
      <div className="flex flex-wrap items-center gap-2 rounded-[12px] border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t('startWithModel')}</span>
        <ModelPicker value={selectedModel} options={models} onChange={setSelectedModel} />
      </div>

      {/* 搜索 + 排序 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-[10px] border border-border bg-card px-3 text-xs text-foreground"
        >
          <option value="popular">{tLib('sort.popular')}</option>
          <option value="recent">{tLib('sort.recent')}</option>
          <option value="alphabetical">{tLib('sort.alphabetical')}</option>
        </select>
      </div>

      {/* 分类 chip 行 */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {CATEGORY_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setCat(k)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
              cat === k
                ? 'border-ink bg-canvas-soft text-ink'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {t(`categories.${k}`)}
          </button>
        ))}
      </div>

      {/* tag 云 (仅当 curated 数据上来后才有意义; tagCloud 空时不渲染) */}
      {tagCloud.length > 0 && (
        <div className="space-y-2 rounded-[12px] border bg-card/50 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              {tLib('tagCloud')}
            </span>
            {tagCloud.length > TOP_TAG_COUNT && (
              <button
                type="button"
                onClick={() => setTagsExpanded((v) => !v)}
                className="text-xs text-ink hover:underline"
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
                className="rounded-full border border-ink bg-canvas-soft px-2.5 py-0.5 text-[11px] text-ink"
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
                  'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                  tagItem.tag === tagFilter
                    ? 'border-ink bg-canvas-soft text-ink'
                    : 'border-border text-muted-foreground hover:border-ink hover:text-foreground',
                )}
              >
                #{tagItem.tag} <span className="text-[9px] opacity-60">{tagItem.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards grid */}
      {filtered === null ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {tCommon('loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-6 w-6 text-muted-foreground/60" />
          <p>{tab === 'mine' ? tLib('mineEmpty') : tLib('noResults')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      className={cn(
        'group relative flex flex-col items-center gap-2 rounded-md border border-border bg-card p-4 text-center transition-all',
        'hover:-translate-y-1 hover:border-ink hover:shadow-[var(--shadow-3)]',
        busy && 'opacity-60',
      )}
    >
      {/* 圆 avatar */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl shadow-inner">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : agent.avatar}
      </div>
      {/* 名字 */}
      <h3 className="line-clamp-1 max-w-full text-sm font-medium">{agent.name}</h3>
      {/* tag chip 行 (最多 2 个; 没 tag 时显 category) */}
      <div className="flex flex-wrap justify-center gap-1">
        {(agent.tags && agent.tags.length > 0 ? agent.tags.slice(0, 2) : [agent.category]).map((tg) => (
          <span
            key={tg}
            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            #{tg}
          </span>
        ))}
      </div>
      {/* description hover 显示, 默认隐藏 (避免卡片高度抖动) */}
      {agent.description && (
        <p className="line-clamp-2 hidden text-[11px] text-muted-foreground sm:group-hover:block">
          {agent.description}
        </p>
      )}
      {/* 用户私有 agent 显示编辑/删除按钮 (绝对定位右上, hover 才出) */}
      {agent.editable && (
        <div className="absolute right-1 top-1 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={t('delete')}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </button>
  );
}
