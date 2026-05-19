'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Copy, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { findModelEntry, type ModelEntry } from '@/lib/models-catalog';
import { useDynamicCatalog, findEntry as findDynamic } from '@/lib/dynamic-catalog';
import { cn } from '@/lib/utils';
import type { Agent } from '@/components/agents/AgentsPanel';

/**
 * Featured agents (slug list). Pulled by slug from GET /api/agents on
 * mount; if a slug is missing (renamed / unseed'd) we silently skip it.
 * Order here = render order.
 */
const FEATURED_SLUGS = [
  'social-media-writer',
  'product-image-generator',
  'code-reviewer',
  'translator-pro',
  'ecom-listing-writer',
];

/**
 * Hot model IDs surfaced as cards. Each card links to /welcome with the
 * model preselected (chat-models persists localStorage `cp:model`).
 */
const HOT_MODEL_IDS = [
  'gpt-5.5',
  'claude-opus-4-7',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash-image', // Nano Banana
  'DeepSeek-V4-Flash',
] as const;

/**
 * Scenario cards key. Each card maps to:
 *   - i18n keys agents.discover.scenarios.<key>.{title,desc,prompt}
 *   - an agent slug to land on
 * Prompt is URL-encoded into ?prompt= query, agent detail page picks
 * it up to seed the composer.
 */
const SCENARIOS: ReadonlyArray<{ key: string; agentSlug: string }> = [
  { key: 'writing_xhs', agentSlug: 'social-media-writer' },
  { key: 'product_main_image', agentSlug: 'product-image-generator' },
  { key: 'code_review', agentSlug: 'code-reviewer' },
  { key: 'translate_doc', agentSlug: 'translator-pro' },
  { key: 'ecom_listing', agentSlug: 'ecom-listing-writer' },
  { key: 'meeting_notes', agentSlug: 'note-taker' },
  { key: 'video_script', agentSlug: 'video-scripter' },
  { key: 'legal_review', agentSlug: 'legal-clause-reviewer' },
];

export function InspirationPanel() {
  const t = useTranslations('agents.discover');
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<{
    title: string;
    prompt: string;
  } | null>(null);
  const dynamicCatalog = useDynamicCatalog();

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const r = await fetch('/api/agents');
      const j = await r.json();
      // /api/agents passthrough returns { success, message, data: { items: [...] } }.
      // Defensive: also accept top-level array or `data` array (older shapes).
      const list: Agent[] = Array.isArray(j)
        ? j
        : Array.isArray(j?.data)
          ? j.data
          : Array.isArray(j?.data?.items)
            ? j.data.items
            : [];
      setAgents(list);
    } catch {
      setAgents([]);
    }
  }

  const featured = (agents ?? [])
    .filter((a) => FEATURED_SLUGS.includes(a.slug))
    .sort(
      (a, b) =>
        FEATURED_SLUGS.indexOf(a.slug) - FEATURED_SLUGS.indexOf(b.slug),
    );

  // M34: prefer admin-overridden displayName / description; fallback to
  // catalog hardcode so the section renders even before dynamic loads.
  const hotModels = HOT_MODEL_IDS.map((id) => {
    const dyn = findDynamic(dynamicCatalog, id);
    if (dyn && dyn.enabled) {
      return {
        id: dyn.id,
        displayName: dyn.displayName,
        description: dyn.description,
        category: dyn.category,
        vendor: dyn.vendor,
        vision: dyn.vision,
      } as ModelEntry;
    }
    return findModelEntry(id);
  }).filter((m): m is ModelEntry => !!m);

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6">
      {/* M37: hero card 一键生图 已挪到 /mini-apps 智能体页, 这里只保留
          featured agents + scenarios + hot models */}

      {/* Hero — featured agents */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4" />
          {t('featured')}
        </h2>
        {featured.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {agents === null ? t('loading') : t('empty')}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {featured.map((a) => (
              <Link
                key={a.slug}
                href={`/agents/${a.slug}` as never}
                className="group"
              >
                <Card className="h-full transition-colors hover:border-ink">
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="text-2xl">{a.avatar || '🤖'}</div>
                    <div className="line-clamp-1 font-medium">{a.name}</div>
                    {a.description && (
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {a.description}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Scenario cards — hardcode prompts */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Wand2 className="h-4 w-4" />
          {t('scenariosTitle')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map(({ key }) => {
            const title = safeT(t, `scenarios.${key}.title`);
            const desc = safeT(t, `scenarios.${key}.desc`);
            const prompt = safeT(t, `scenarios.${key}.prompt`);
            if (!title) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPreviewPrompt({ title, prompt })}
                className="group text-left"
              >
                <Card className="h-full transition-colors hover:border-ink">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="font-medium leading-snug">{title}</div>
                    {desc && (
                      <div className="text-xs text-muted-foreground">{desc}</div>
                    )}
                    <div
                      className={cn(
                        'mt-auto inline-flex items-center gap-1 text-xs text-ink',
                        'opacity-0 transition-opacity group-hover:opacity-100',
                      )}
                    >
                      {t('viewPrompt')} <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      <Dialog open={!!previewPrompt} onOpenChange={(o) => !o && setPreviewPrompt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewPrompt?.title}</DialogTitle>
            <DialogDescription className="sr-only">
              {previewPrompt?.title}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
            {previewPrompt?.prompt}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!previewPrompt) return;
                await navigator.clipboard.writeText(previewPrompt.prompt);
                toast.success(t('promptCopied'));
              }}
            >
              <Copy className="h-4 w-4" />
              {t('copyPrompt')}
            </Button>
            <Button asChild size="sm">
              <Link href={'/welcome' as never}>
                {t('goChat')} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hot models */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4" />
          {t('modelsTitle')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {hotModels.map((m) => (
            <Link
              key={m.id}
              href={`/welcome?model=${encodeURIComponent(m.id)}` as never}
              className="group"
            >
              <Card className="h-full transition-colors hover:border-ink">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="font-medium">{m.displayName}</div>
                  <div className="line-clamp-3 text-xs text-muted-foreground">
                    {m.description}
                  </div>
                  <div className="mt-auto text-xs uppercase tracking-wider text-muted-foreground">
                    {m.category}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Returns '' instead of throwing when the i18n key is missing. */
function safeT(t: (k: string) => string, key: string): string {
  try {
    const v = t(key);
    // next-intl returns key path on miss; treat that as missing
    return v === key ? '' : v;
  } catch {
    return '';
  }
}
