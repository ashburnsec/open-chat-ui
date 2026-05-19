'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImageIcon, Loader2, Pencil, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { findModelEntry } from '@/lib/models-catalog';
import { clearDynamicCatalogCache } from '@/lib/dynamic-catalog';
import { AI_ICONS, AiIcon, type AiIconDef, type AiIconKey } from '@/lib/ai-icons';
import type { AdminModel } from '@/lib/admin-models';
import { cn } from '@/lib/utils';

/**
 * M34 admin UI for chat-portal model display overrides.
 *
 * Each row shows:
 *   - bare model id + (optional) catalog hardcode displayName as a hint
 *   - admin-set display_name (with placeholder = catalog fallback)
 *   - admin-set description (truncated; full text in edit dialog)
 *   - enabled toggle (immediate save)
 *   - sort_order
 *   - edit / delete-override actions
 *
 * Bulk header buttons let admin enable/disable everything visible in the
 * current search filter. Calls go through the generic /api/conv/[...path]
 * BFF passthrough — convFetch injects auth headers, conv-svc enforces
 * requireAdmin server-side.
 */

const noop = (..._args: unknown[]) => {
  void _args;
};

// Suppress lint when we deliberately don't use a value
void noop;

export function ModelDisplayPanel({ initial }: { initial: AdminModel[] }) {
  const t = useTranslations('admin.models');
  const [models, setModels] = useState<AdminModel[]>(() =>
    [...initial].sort(sortAdminModels),
  );
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminModel | null>(null);
  // M41 follow-up³: 单独的 icon picker dialog state
  const [iconEditing, setIconEditing] = useState<AdminModel | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    // Match only model_id + (override or fallback) display name —
    // description fuzzy-matching surfaces unrelated rows (e.g. searching
    // "gpt" caught DeepSeek-V4-Flash because its description mentions
    // "对齐 GPT-5.4").
    return models.filter((m) => {
      const fb = findModelEntry(m.model_id);
      const hay = `${m.model_id} ${m.display_name ?? ''} ${fb?.displayName ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [models, search]);

  async function save(modelId: string, patch: Partial<AdminModel>): Promise<boolean> {
    const original = models.find((m) => m.model_id === modelId);
    if (!original) return false;
    const next: AdminModel = {
      ...original,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    // Optimistic
    setModels((prev) => prev.map((m) => (m.model_id === modelId ? next : m)).sort(sortAdminModels));
    try {
      const r = await fetch(
        `/api/conv/v1/admin/models/${encodeURIComponent(modelId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: next.enabled,
            display_name: next.display_name,
            description: next.description,
            sort_order: next.sort_order,
            icon: next.icon,
          }),
        },
      );
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || 'save failed');
      clearDynamicCatalogCache();
      return true;
    } catch (e) {
      // Rollback
      setModels((prev) =>
        prev.map((m) => (m.model_id === modelId ? original : m)).sort(sortAdminModels),
      );
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
      return false;
    }
  }

  async function bulkEnable(enabled: boolean) {
    setBusy(true);
    const ids = visible.map((m) => m.model_id);
    try {
      const r = await fetch('/api/conv/v1/admin/models/bulk-enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_ids: ids, enabled }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || 'bulk failed');
      setModels((prev) =>
        prev.map((m) => (ids.includes(m.model_id) ? { ...m, enabled } : m)).sort(sortAdminModels),
      );
      clearDynamicCatalogCache();
      toast.success(t('saveSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteOverride(modelId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/conv/v1/admin/models/${encodeURIComponent(modelId)}`, {
        method: 'DELETE',
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || 'delete failed');
      setModels((prev) =>
        prev.map((m) =>
          m.model_id === modelId
            ? { ...m, enabled: true, display_name: null, description: null, sort_order: 999, icon: null }
            : m,
        ),
      );
      clearDynamicCatalogCache();
      toast.success(t('resetSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || visible.length === 0}
          onClick={() => void bulkEnable(true)}
        >
          {t('bulk.enableAll', { n: visible.length })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || visible.length === 0}
          onClick={() => void bulkEnable(false)}
        >
          {t('bulk.disableAll', { n: visible.length })}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t('col.modelId')}</th>
              <th className="px-3 py-2 text-left">{t('col.displayName')}</th>
              <th className="px-3 py-2 text-left">{t('col.description')}</th>
              <th className="px-3 py-2 text-center">{t('col.icon')}</th>
              <th className="px-3 py-2 text-center">{t('col.enabled')}</th>
              <th className="px-3 py-2 text-center">{t('col.sort')}</th>
              <th className="px-3 py-2 text-center">{t('col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => {
              const fb = findModelEntry(m.model_id);
              const effectiveName = m.display_name ?? fb?.displayName ?? m.model_id;
              const fallbackHint = !m.display_name && fb?.displayName ? fb.displayName : null;
              const desc = m.description ?? fb?.description ?? '';
              return (
                <tr key={m.model_id} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 font-mono text-xs">{m.model_id}</td>
                  <td className="px-3 py-2">
                    <div className={cn('font-medium', !m.display_name && 'text-muted-foreground')}>
                      {effectiveName}
                    </div>
                    {fallbackHint && (
                      <div className="text-[10px] text-muted-foreground">
                        {t('fallbackHint')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {desc || <span className="italic">{t('noDescription')}</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setIconEditing(m)}
                      disabled={busy}
                      title={m.icon ? t('iconEdit') : t('iconPick')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent"
                    >
                      {m.icon ? (
                        <AiIcon iconKey={m.icon} size={22} />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={m.enabled}
                      onClick={() => void save(m.model_id, { enabled: !m.enabled })}
                      disabled={busy}
                      className={cn(
                        'inline-flex h-5 w-9 items-center rounded-full border transition-colors',
                        m.enabled
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30 bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform',
                          m.enabled ? 'translate-x-5' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                    {m.sort_order === 999 ? '—' : m.sort_order}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditing(m)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {(m.display_name ||
                        m.description ||
                        m.sort_order !== 999 ||
                        !m.enabled) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={t('resetOverride')}
                          onClick={() => void deleteOverride(m.model_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        )}
      </div>

      <EditDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          const ok = await save(editing.model_id, patch);
          if (ok) {
            toast.success(t('saveSuccess'));
            setEditing(null);
          }
        }}
        busy={busy}
      />

      <IconPickerDialog
        target={iconEditing}
        onClose={() => setIconEditing(null)}
        onPick={async (key) => {
          if (!iconEditing) return;
          const ok = await save(iconEditing.model_id, { icon: key });
          if (ok) {
            toast.success(t('saveSuccess'));
            setIconEditing(null);
          }
        }}
        busy={busy}
      />
    </div>
  );
}

/** M41 follow-up³: icon picker dialog — grid 显示全部 AI_ICONS 让 admin 挑. */
function IconPickerDialog({
  target,
  onClose,
  onPick,
  busy,
}: {
  target: AdminModel | null;
  onClose: () => void;
  onPick: (key: AiIconKey | null) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations('admin.models');
  const [tab, setTab] = useState<AiIconDef['category'] | 'all'>('all');
  if (!target) return null;
  const visible =
    tab === 'all' ? AI_ICONS : AI_ICONS.filter((i) => i.category === tab);
  const categories: Array<AiIconDef['category'] | 'all'> = [
    'all', 'chat', 'image', 'video', 'code', 'cloud', 'misc',
  ];
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('iconPickerTitle')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{target.model_id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTab(c)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  c === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t(`iconCategory.${c}`)}
              </button>
            ))}
          </div>
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
            {visible.map((def) => (
              <button
                key={def.key}
                type="button"
                onClick={() => void onPick(def.key as AiIconKey)}
                disabled={busy}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors',
                  target.icon === def.key
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-primary/40 hover:bg-accent/40',
                )}
              >
                <AiIcon iconKey={def.key} size={36} />
                <span className="line-clamp-2 text-[10px] font-medium leading-tight">{def.label}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => void onPick(null)}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            {t('iconClear')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            <X className="h-4 w-4" />
            {t('edit.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  editing,
  onClose,
  onSave,
  busy,
}: {
  editing: AdminModel | null;
  onClose: () => void;
  onSave: (patch: Partial<AdminModel>) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations('admin.models.edit');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Reset state on open. Keyed on model_id so clicking a different row
  // refreshes the form without forcing the parent to rotate keys.
  useMemo(() => {
    if (editing) {
      setDisplayName(editing.display_name ?? '');
      setDescription(editing.description ?? '');
      setSortOrder(editing.sort_order === 999 ? '' : String(editing.sort_order));
      setEnabled(editing.enabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.model_id]);

  if (!editing) return null;
  const fb = findModelEntry(editing.model_id);

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{editing.model_id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">{t('displayName')}</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={fb?.displayName ?? editing.model_id}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={fb?.description ?? ''}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              rows={4}
              maxLength={1000}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">{t('sortOrder')}</label>
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="999"
                className="mt-1"
                inputMode="numeric"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{t('enabled')}</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            <X className="h-4 w-4" />
            {t('cancel')}
          </Button>
          <Button
            onClick={() =>
              void onSave({
                display_name: displayName.trim() || null,
                description: description.trim() || null,
                sort_order: sortOrder ? Number(sortOrder) : 999,
                enabled,
              })
            }
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sortAdminModels(a: AdminModel, b: AdminModel): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.model_id.localeCompare(b.model_id);
}
