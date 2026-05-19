'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, KeyRound, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/hooks/use-confirm';
import { RevealKeyModal } from '@/components/developer/RevealKeyModal';
import { isInternalTokenName } from '@/lib/usage-source';
import type { Token } from '@/lib/newapi-client';

/**
 * /keys page body — list, create, reveal, edit, delete user-owned API
 * tokens. Hides our internally-minted "webchat" token (and its legacy
 * `chat-portal-default` predecessor) so users don't accidentally
 * rotate the one we use for /v1/responses and /v1/images/*.
 *
 * Uses the generic /api/newapi/* BFF passthrough — no dedicated route
 * handler needed because every operation is a one-shot REST call.
 */
export function KeysPanel({
  quotaPerUnit,
  embedded = false,
}: {
  quotaPerUnit: number;
  /** True when rendered inside DeveloperHub tabs — drops the outer
   *  page-level wrapper and the duplicate header so the hub's own title
   *  and tab chrome stay the only ones on screen. */
  embedded?: boolean;
}) {
  const t = useTranslations('keys');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  // Holds the freshly-created token's clear-text key (only present
  // immediately after creation; cleared when the modal closes).
  const [reveal, setReveal] = useState<{ name: string; fullKey: string } | null>(
    null,
  );

  async function load() {
    try {
      const r = await fetch('/api/newapi/api/token/?p=0&size=100', { cache: 'no-store' });
      const j = await r.json();
      const items = Array.isArray(j?.data) ? j.data : (j?.data?.items ?? []);
      setTokens(
        (items as Token[]).filter((tok) => !isInternalTokenName(tok.name)),
      );
    } catch {
      toast.error(t('loadFailed'));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: number, name: string) {
    const ok = await confirm({
      title: t('deleteConfirmTitle'),
      description: t('deleteConfirm', { name }),
      confirmLabel: t('revoke'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/newapi/api/token/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('deleteFailed'));
      toast.success(t('deleted'));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto w-full max-w-5xl space-y-4 p-6'}>
      <div className="flex items-center justify-between gap-4">
        {embedded ? (
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        ) : (
          <div>
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        )}
        <Button onClick={() => setCreating(true)} disabled={busy || creating}>
          <Plus className="h-4 w-4" /> {t('create')}
        </Button>
      </div>

      {creating && (
        <CreateKeyForm
          quotaPerUnit={quotaPerUnit}
          onCancel={() => setCreating(false)}
          onCreated={(info) => {
            setCreating(false);
            if (info) setReveal(info);
            void load();
          }}
        />
      )}

      <RevealKeyModal
        open={reveal !== null}
        fullKey={reveal?.fullKey ?? null}
        tokenName={reveal?.name ?? ''}
        onClose={() => setReveal(null)}
      />

      {tokens === null ? (
        <Card><CardContent className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('loading')}</CardContent></Card>
      ) : tokens.length === 0 ? (
        <Card>
          <CardContent className="flex h-40 flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <KeyRound className="mb-2 h-6 w-6" />
            {t('empty')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('col.name')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('col.key')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.used')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.remaining')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('col.status')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('col.expires')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((tok) => (
                  <KeyRow
                    key={tok.id}
                    token={tok}
                    quotaPerUnit={quotaPerUnit}
                    busy={busy}
                    onDelete={() => handleDelete(tok.id, tok.name)}
                    onChanged={() => void load()}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KeyRow({
  token,
  quotaPerUnit,
  busy,
  onDelete,
  onChanged,
}: {
  token: Token;
  quotaPerUnit: number;
  busy: boolean;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('keys');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [editing, setEditing] = useState(false);

  async function reveal() {
    setRevealing(true);
    try {
      const r = await fetch(`/api/newapi/api/token/${token.id}/key`, { method: 'POST' });
      const j = await r.json();
      if (!j?.success || !j.data?.key) throw new Error(j?.message || t('reveal.failed'));
      const sk = `sk-${j.data.key}`;
      setRevealed(sk);
      try {
        await navigator.clipboard.writeText(sk);
        toast.success(t('reveal.copied'));
      } catch {
        toast.success(t('reveal.shown'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('reveal.rateLimited'));
    } finally {
      setRevealing(false);
    }
  }

  const expiresLabel =
    token.expired_time === -1
      ? t('neverExpires')
      : new Date(token.expired_time * 1000).toLocaleDateString();

  const usedUsd = token.unlimited_quota
    ? '—'
    : `$${(token.remain_quota / quotaPerUnit).toFixed(4)}`;

  if (editing) {
    return (
      <tr className="border-t">
        <td colSpan={7} className="p-4">
          <EditKeyForm
            token={token}
            quotaPerUnit={quotaPerUnit}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{token.name}</td>
      <td className="px-4 py-2 font-mono text-xs">
        {revealed ?? token.key}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
      <td className="px-4 py-2 text-right tabular-nums">{usedUsd}</td>
      <td className="px-4 py-2">
        <span
          className={
            token.status === 1
              ? 'rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700'
              : 'rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'
          }
        >
          {token.status === 1 ? t('statusEnabled') : t('statusDisabled')}
        </span>
      </td>
      <td className="px-4 py-2 text-muted-foreground">{expiresLabel}</td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={reveal}
            disabled={busy || revealing}
            title={t('reveal.title')}
          >
            {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy} title={t('rowActions.edit')}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            title={t('rowActions.delete')}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CreateKeyForm({
  quotaPerUnit,
  onCancel,
  onCreated,
}: {
  quotaPerUnit: number;
  onCancel: () => void;
  /** Called after a successful POST. Argument is the freshly-revealed
   *  key bundle when the two follow-up calls succeed (list → reveal),
   *  or null when reveal failed — the caller still gets a chance to
   *  refresh the table either way. */
  onCreated: (info: { name: string; fullKey: string } | null) => void;
}) {
  const t = useTranslations('keys');
  const [name, setName] = useState('');
  const [unlimited, setUnlimited] = useState(true);
  const [budgetUsd, setBudgetUsd] = useState('1');
  const [neverExpire, setNeverExpire] = useState(true);
  const [expireDate, setExpireDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tokenName = name.trim() || `key-${Date.now().toString(36).slice(-4)}`;
      const body: Record<string, unknown> = {
        name: tokenName,
        unlimited_quota: unlimited,
        remain_quota: unlimited ? 0 : Math.round(Number(budgetUsd) * quotaPerUnit),
        expired_time: neverExpire ? -1 : Math.floor(new Date(expireDate).getTime() / 1000),
        group: 'default',
        model_limits_enabled: false,
      };
      const r = await fetch('/api/newapi/api/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('createFailed'));
      toast.success(t('createdToast'));

      // new-api `POST /api/token/` does NOT return the new key — the
      // caller has to list to find the id, then `POST /:id/key` to
      // reveal. (See docs/newapi-endpoints.md footgun #6.) We fold
      // both calls in here so the parent only sees a finished bundle.
      const fullKey = await fetchNewKey(tokenName);
      onCreated(fullKey ? { name: tokenName, fullKey } : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('createFailed'));
      onCreated(null);
    } finally {
      setSubmitting(false);
    }
  }

  /** List user's tokens and grab the cleartext key for the newest one
   *  with the given name. Returns null on any failure — caller falls
   *  back to a "click the eye icon" Toast in that case. */
  async function fetchNewKey(tokenName: string): Promise<string | null> {
    try {
      const list = await fetch('/api/newapi/api/token/?p=0&size=50', {
        cache: 'no-store',
      });
      const lj = await list.json();
      const items: Token[] = Array.isArray(lj?.data)
        ? lj.data
        : (lj?.data?.items ?? []);
      const match = items
        .filter((t) => t.name === tokenName)
        .sort((a, b) => b.created_time - a.created_time)[0];
      if (!match) return null;
      const r = await fetch(`/api/newapi/api/token/${match.id}/key`, {
        method: 'POST',
      });
      const j = await r.json();
      if (!j?.success || !j?.data?.key) return null;
      return `sk-${j.data.key}`;
    } catch {
      return null;
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ck-name">{t('name')}</Label>
            <Input
              id="ck-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholderLong')}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('quota.label')}</Label>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={unlimited} onChange={() => setUnlimited(true)} /> {t('quota.unlimited')}
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={!unlimited} onChange={() => setUnlimited(false)} /> {t('quota.limited')}
              </label>
              {!unlimited && (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetUsd}
                  onChange={(e) => setBudgetUsd(e.target.value)}
                  className="w-28"
                />
              )}
              {!unlimited && <span className="text-muted-foreground">USD</span>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('expiry.label')}</Label>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={neverExpire} onChange={() => setNeverExpire(true)} /> {t('expiry.never')}
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={!neverExpire} onChange={() => setNeverExpire(false)} /> {t('expiry.date')}
              </label>
              {!neverExpire && (
                <Input
                  type="date"
                  value={expireDate}
                  onChange={(e) => setExpireDate(e.target.value)}
                  className="w-40"
                  required
                />
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>{t('actions.cancel')}</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('actions.create')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EditKeyForm({
  token,
  quotaPerUnit,
  onCancel,
  onSaved,
}: {
  token: Token;
  quotaPerUnit: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('keys');
  const [name, setName] = useState(token.name);
  const [unlimited, setUnlimited] = useState(token.unlimited_quota);
  const [budgetUsd, setBudgetUsd] = useState(
    (token.remain_quota / quotaPerUnit).toFixed(4),
  );
  const [enabled, setEnabled] = useState(token.status === 1);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        id: token.id,
        name: name.trim(),
        unlimited_quota: unlimited,
        remain_quota: unlimited ? token.remain_quota : Math.round(Number(budgetUsd) * quotaPerUnit),
        status: enabled ? 1 : 2,
        expired_time: token.expired_time,
        group: token.group,
        model_limits_enabled: token.model_limits_enabled,
      };
      const r = await fetch('/api/newapi/api/token/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('saveFailed'));
      toast.success(t('saved'));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
      <div className="space-y-1.5">
        <Label>{t('name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>{t('quota.label')}</Label>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} /> {t('quota.unlimited')}
          </label>
          {!unlimited && (
            <Input
              type="number"
              step="0.01"
              min="0"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              className="w-28"
            />
          )}
          {!unlimited && <span className="text-muted-foreground">USD</span>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('status.label')}</Label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('status.enabled')}
        </label>
      </div>
      <div className="flex justify-end gap-2 md:col-span-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          <X className="h-4 w-4" /> {t('actions.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('actions.save')}
        </Button>
      </div>
    </form>
  );
}
