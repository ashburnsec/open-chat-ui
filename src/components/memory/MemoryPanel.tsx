'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Brain, Loader2, Pencil, Plus, Trash2, X,
  BookOpen, Heart, FolderKanban, Lightbulb, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';

type Memory = {
  id: number;
  userId: number;
  content: string;
  category: 'fact' | 'preference' | 'profile' | 'project' | string;
  importance: number;
  lastUsedAt: string | null;
  createdAt: string;
};

type CategorySpec = { Icon: React.ComponentType<{ className?: string }>; bg: string; fg: string; ring: string };
const CATEGORY_SPEC: Record<string, CategorySpec> = {
  fact:       { Icon: BookOpen,      bg: 'bg-blue-50 dark:bg-blue-950',    fg: 'text-blue-600 dark:text-blue-400',    ring: 'ring-blue-200 dark:ring-blue-800'    },
  preference: { Icon: Heart,         bg: 'bg-emerald-50 dark:bg-emerald-950', fg: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  profile:    { Icon: Lightbulb,     bg: 'bg-violet-50 dark:bg-violet-950', fg: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-200 dark:ring-violet-800' },
  project:    { Icon: FolderKanban,  bg: 'bg-amber-50 dark:bg-amber-950',  fg: 'text-amber-600 dark:text-amber-400',  ring: 'ring-amber-200 dark:ring-amber-800'  },
};
const FALLBACK_SPEC: CategorySpec = {
  Icon: Tag, bg: 'bg-muted', fg: 'text-muted-foreground', ring: 'ring-border',
};

export function MemoryPanel() {
  const t = useTranslations('memory');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [items, setItems] = useState<Memory[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/memories', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success) {
        setItems((j.data?.items ?? []) as Memory[]);
        setEnabled(Boolean(j.data?.memory_enabled));
      }
    } catch {
      toast.error(t('loadFailed'));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function toggleEnabled(next: boolean) {
    setBusy(true);
    try {
      const r = await fetch('/api/memories/preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory_enabled: next }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('toggle.failed'));
      setEnabled(next);
      toast.success(next ? t('toggle.enabled') : t('toggle.disabled'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toggle.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const ok = await confirm({
      title: t('deleteConfirmTitle'),
      description: t('deleteConfirm'),
      confirmLabel: t('delete'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('deleteFailed'));
      setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
      toast.success(t('deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Memory[]>();
    for (const m of items ?? []) {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    }
    // Stable category order: known first, others appended.
    const order = ['profile', 'preference', 'fact', 'project'];
    return [...map.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [items]);

  const knownCategories: ReadonlyArray<'fact' | 'preference' | 'profile' | 'project'> = [
    'fact',
    'preference',
    'profile',
    'project',
  ];
  const labelForCategory = (c: string) =>
    knownCategories.includes(c as any) ? t(`categories.${c}` as any) : c;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950">
            <Brain className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">{t('title')}</h1>
            <p className="text-[12px] text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {enabled !== null && (
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <span className="text-[12px] text-muted-foreground">
                {enabled ? t('toggle.on') : t('toggle.off')}
              </span>
              {/* Custom toggle switch */}
              <span
                role="switch"
                aria-checked={enabled}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                  enabled ? 'bg-foreground' : 'bg-muted',
                  busy && 'opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={busy}
                  onChange={(e) => void toggleEnabled(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                    enabled ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </span>
            </label>
          )}
          <Button size="sm" onClick={() => setAdding(true)} disabled={adding || busy}>
            <Plus className="h-3.5 w-3.5" /> {t('addManually')}
          </Button>
        </div>
      </div>

      {enabled === false && (
        <div className="rounded-lg border border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground">
          {t('disabledHint')}
        </div>
      )}

      {adding && (
        <AddForm
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      {items === null ? (
        <div className="space-y-px">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-3">
              <div className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Brain className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        grouped.map(([category, ms]) => {
          const spec = CATEGORY_SPEC[category] ?? FALLBACK_SPEC;
          const CatIcon = spec.Icon;
          return (
            <div key={category} className="overflow-hidden rounded-xl border border-border bg-background">
              {/* Category header */}
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                <div className={cn('flex h-6 w-6 items-center justify-center rounded-md ring-1', spec.bg, spec.ring)}>
                  <CatIcon className={cn('h-3.5 w-3.5', spec.fg)} strokeWidth={1.75} />
                </div>
                <span className="text-[13px] font-semibold text-foreground">{labelForCategory(category)}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{t('count', { n: ms.length })}</span>
              </div>
              <ul className="divide-y divide-border">
                {ms
                  .sort((a, b) => b.importance - a.importance)
                  .map((m) => (
                    <MemoryRow
                      key={m.id}
                      memory={m}
                      onChanged={() => void load()}
                      onDelete={() => remove(m.id)}
                      disabled={busy}
                    />
                  ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}

function MemoryRow({
  memory,
  onChanged,
  onDelete,
  disabled,
}: {
  memory: Memory;
  onChanged: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const t = useTranslations('memory');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [importance, setImportance] = useState(memory.importance);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft.trim() || draft.length > 500) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/memories/${memory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft.trim(), importance }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('saveFailed'));
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-start gap-3 border-t px-4 py-3 first:border-t-0">
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-md border bg-background p-2 text-sm"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('importanceShort')}</span>
              <input
                type="number"
                min={1}
                max={10}
                value={importance}
                onChange={(e) => setImportance(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
                className="w-16 rounded border bg-background px-2 py-0.5 text-foreground"
              />
              <span className="ml-auto">{draft.length}/500</span>
            </div>
          </div>
        ) : (
          <div className="text-sm">{memory.content}</div>
        )}
        {!editing && (
          <div className="mt-1 text-xs text-muted-foreground">
            {t('row.importance', { n: memory.importance })} ·{' '}
            {memory.lastUsedAt
              ? t('row.lastUsedOn', { date: new Date(memory.lastUsedAt).toLocaleDateString() })
              : t('row.notUsed')}
            {' · '}
            {t('row.createdOn', { date: new Date(memory.createdAt).toLocaleDateString() })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !draft.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('save')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(memory.content);
                setImportance(memory.importance);
                setEditing(true);
              }}
              disabled={disabled}
              title={t('row.edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              disabled={disabled}
              title={t('row.delete')}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function AddForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('memory');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('preference');
  const [importance, setImportance] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), category, importance }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('addFailed'));
      toast.success(t('added'));
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-3">
            <Label>{t('contentLabel')}</Label>
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('contentPlaceholder')}
              className="w-full resize-none rounded-md border bg-background p-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('categoryLabel')}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="profile">{t('categories.profile')}</option>
              <option value="preference">{t('categories.preference')}</option>
              <option value="fact">{t('categories.fact')}</option>
              <option value="project">{t('categories.project')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('importanceLabel')}</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !content.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
