'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { filterChatModels, getModelCapabilities } from '@/lib/chat-models';
import { loadDynamicCatalog, visibleModels } from '@/lib/dynamic-catalog';
import type { Agent } from './AgentsPanel';
import type { ConversationDefaultParams } from '@/lib/conv';

const REASONING_OPTIONS = [
  { value: '', labelKey: 'reasoningOff' },
  { value: 'minimal', labelKey: 'reasoningMinimal' },
  { value: 'low', labelKey: 'reasoningLow' },
  { value: 'medium', labelKey: 'reasoningMedium' },
  { value: 'high', labelKey: 'reasoningHigh' },
] as const;

const CATEGORIES = ['writing', 'coding', 'learning', 'life', 'productivity', 'other'] as const;

/**
 * Shared form for creating + editing a user-private agent. The "edit"
 * mode loads the existing agent on mount and constrains the slug, so
 * `initialSlug` flips the surface between POST and PATCH /api/agents.
 *
 * Default model is a ModelPicker constrained to the user's currently-
 * available chat models (fetched from /api/user/models on mount).
 * Empty selection = fall back to global default at conversation creation.
 */
export function AgentForm({ initialSlug }: { initialSlug?: string }) {
  const t = useTranslations('agents.form');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [loading, setLoading] = useState(!!initialSlug);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('other');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  // M17-P1a: composer presets users can pre-set on the agent. Each falls
  // back to "no override" (undefined) when the corresponding capability
  // isn't supported by the chosen default model.
  const [paramWebSearch, setParamWebSearch] = useState(false);
  const [paramImageMode, setParamImageMode] = useState(false);
  const [paramReasoning, setParamReasoning] = useState<string>('');
  // Chat models the user has access to right now. Used by the picker
  // below; loaded from /api/user/models on mount.
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const capabilities = getModelCapabilities(defaultModel || null);

  useEffect(() => {
    void (async () => {
      try {
        // M34: pull merged dynamic catalog so admin-disabled models drop
        // out of the agent default-model picker; legacy filterChatModels
        // still strips image/video/audio because chat-only here.
        const catalog = await loadDynamicCatalog();
        const ids = visibleModels(catalog).map((m) => m.id);
        setAvailableModels(filterChatModels(ids));
      } catch {
        /* picker shows empty options; user can still save with empty default. */
      }
    })();
  }, []);

  useEffect(() => {
    if (!initialSlug) return;
    void (async () => {
      try {
        const r = await fetch(`/api/agents/${encodeURIComponent(initialSlug)}`, {
          cache: 'no-store',
        });
        const j = await r.json();
        if (!j?.success || !j.data) {
          toast.error(t('loadFailed'));
          return;
        }
        const a = j.data as Agent;
        setName(a.name);
        setAvatar(a.avatar || '🤖');
        setCategory(
          (CATEGORIES as readonly string[]).includes(a.category)
            ? (a.category as (typeof CATEGORIES)[number])
            : 'other',
        );
        setDescription(a.description ?? '');
        setSystemPrompt(a.system_prompt);
        setDefaultModel(a.default_model ?? '');
        const dp = a.default_params ?? null;
        setParamWebSearch(dp?.webSearch === true);
        setParamImageMode(dp?.imageMode === true);
        setParamReasoning(typeof dp?.reasoningEffort === 'string' ? dp.reasoningEffort : '');
      } catch {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, [initialSlug, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;
    setSaving(true);
    try {
      // Drop preset toggles whose capability isn't supported by the
      // currently-picked default model — the agent should not commit
      // a flag that would just get filtered out at send-time.
      const params: ConversationDefaultParams = {};
      if (capabilities.webSearch && paramWebSearch) params.webSearch = true;
      if (capabilities.imageGeneration && paramImageMode) params.imageMode = true;
      if (capabilities.reasoning && paramReasoning) {
        params.reasoningEffort = paramReasoning as ConversationDefaultParams['reasoningEffort'];
      }
      const payload = {
        name: name.trim(),
        avatar: avatar.slice(0, 8) || '🤖',
        category,
        description: description.trim() || null,
        system_prompt: systemPrompt.trim(),
        default_model: defaultModel.trim() || null,
        default_params: Object.keys(params).length > 0 ? params : null,
      };
      const url = initialSlug
        ? `/api/agents/${encodeURIComponent(initialSlug)}`
        : '/api/agents';
      const method = initialSlug ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        throw new Error(j?.message || t('saveFailed'));
      }
      toast.success(t('saved'));
      router.push('/agents' as never);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex h-40 max-w-3xl items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {tCommon('loading')}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" className="h-9 w-9">
          <Link href={'/agents' as never} aria-label={t('back')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">
          {initialSlug ? t('editTitle') : t('newTitle')}
        </h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="ag-avatar">{t('avatar')}</Label>
              <Input
                id="ag-avatar"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                maxLength={8}
                placeholder={t('avatarPlaceholder')}
                className="text-center text-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-name">{t('name')}</Label>
              <Input
                id="ag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                maxLength={50}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-cat">{t('category')}</Label>
            <select
              id="ag-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className="flex h-11 w-full rounded-lg border bg-background px-4 text-sm focus-visible:outline-none focus-visible:border-foreground/40"
            >
              {CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-desc">{t('description')}</Label>
            <Input
              id="ag-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-prompt">{t('systemPrompt')}</Label>
            <textarea
              id="ag-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('systemPromptPlaceholder')}
              required
              rows={10}
              maxLength={8000}
              className="block w-full resize-y rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('defaultModel')}</Label>
            <div className="flex items-center gap-2">
              <ModelPicker
                value={defaultModel || null}
                options={availableModels}
                onChange={(m) => setDefaultModel(m)}
              />
              {defaultModel && (
                <button
                  type="button"
                  onClick={() => setDefaultModel('')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={tCommon('cancel')}
                  title={t('defaultModelHint')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('defaultModelHint')}</p>
          </div>

          {(capabilities.webSearch || capabilities.reasoning || capabilities.imageGeneration) && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('defaultParams')}
              </Label>
              <p className="text-xs text-muted-foreground">{t('defaultParamsHint')}</p>
              <div className="flex flex-wrap gap-3 pt-1">
                {capabilities.webSearch && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={paramWebSearch}
                      onChange={(e) => setParamWebSearch(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {t('paramWebSearch')}
                  </label>
                )}
                {capabilities.imageGeneration && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={paramImageMode}
                      onChange={(e) => setParamImageMode(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {t('paramImageMode')}
                  </label>
                )}
                {capabilities.reasoning && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    {t('paramReasoning')}
                    <select
                      value={paramReasoning}
                      onChange={(e) => setParamReasoning(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:border-foreground/40"
                    >
                      {REASONING_OPTIONS.map((o) => (
                        <option key={o.value || 'off'} value={o.value}>
                          {t(o.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button asChild variant="ghost">
              <Link href={'/agents' as never}>{tCommon('cancel')}</Link>
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !systemPrompt.trim()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : initialSlug ? (
                t('save')
              ) : (
                tCommon('create')
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
