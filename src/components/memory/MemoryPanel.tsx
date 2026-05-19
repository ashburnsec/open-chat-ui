'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Brain, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
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

const CATEGORY_COLORS: Record<string, string> = {
  fact: 'bg-blue-500/10 text-blue-700',
  preference: 'bg-emerald-500/10 text-emerald-700',
  profile: 'bg-purple-500/10 text-purple-700',
  project: 'bg-amber-500/10 text-amber-700',
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
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        {enabled !== null && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span>{enabled ? t('toggle.on') : t('toggle.off')}</span>
          </label>
        )}
      </div>

      {enabled === false && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t('disabledHint')}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)} disabled={adding || busy}>
          <Plus className="h-4 w-4" /> {t('addManually')}
        </Button>
      </div>

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
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex h-40 flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <Brain className="mb-2 h-6 w-6" />
            {t('empty')}
          </CardContent>
        </Card>
      ) : (
        grouped.map(([category, ms]) => (
          <Card key={category}>
            <CardContent className="p-0">
              <div className="border-b px-4 py-2 text-sm font-medium">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    CATEGORY_COLORS[category] ?? 'bg-muted',
                  )}
                >
                  {labelForCategory(category)}
                </span>
                <span className="ml-2 text-muted-foreground">{t('count', { n: ms.length })}</span>
              </div>
              <ul>
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
            </CardContent>
          </Card>
        ))
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
