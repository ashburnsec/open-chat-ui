'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Check, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ToolGuideCard } from './ToolGuideCard';
import { API_BASE_URL, TOOL_ORDER } from '@/lib/developer-config';
import { isInternalTokenName } from '@/lib/usage-source';
import { cn } from '@/lib/utils';
import type { Token } from '@/lib/newapi-client';

/**
 * Setup-guide tab: shows the public base URL once, lets the user pick
 * which of their API keys to use, then renders 5 tool cards (CC /
 * Codex / Cursor / Cherry Studio / generic OpenAI-compatible). Each
 * card's snippets are filled in with the real key so users can copy
 * straight into their tool of choice without ever switching tabs.
 *
 * The full key is fetched once per selection via the new-api reveal
 * endpoint (`POST /api/token/:id/key`). The endpoint is rate-limited;
 * we cache the revealed value in component state so flipping cards
 * doesn't re-hit it.
 */
export function HowToPanel() {
  const t = useTranslations('developer');
  const tKeys = useTranslations('keys');
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [baseCopied, setBaseCopied] = useState(false);

  // Load user's tokens once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/newapi/api/token/?p=0&size=100', {
          cache: 'no-store',
        });
        const j = await r.json();
        const items: Token[] = Array.isArray(j?.data)
          ? j.data
          : (j?.data?.items ?? []);
        const filtered = items.filter((tok) => !isInternalTokenName(tok.name));
        if (cancelled) return;
        setTokens(filtered);
        if (filtered.length > 0) setSelectedId(filtered[0]!.id);
      } catch {
        if (!cancelled) setTokens([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reveal the selected token's full key. Cached in `revealed` state
  // so the 5 tool cards all read from the same value. Re-runs whenever
  // the user picks a different token chip.
  useEffect(() => {
    if (selectedId === null) {
      setRevealed(null);
      return;
    }
    let cancelled = false;
    setRevealing(true);
    setRevealed(null);
    (async () => {
      try {
        const r = await fetch(`/api/newapi/api/token/${selectedId}/key`, {
          method: 'POST',
        });
        const j = await r.json();
        if (!j?.success || !j.data?.key) {
          throw new Error(j?.message ?? 'reveal failed');
        }
        if (!cancelled) setRevealed(`sk-${j.data.key}`);
      } catch {
        if (!cancelled) toast.error(tKeys('reveal.failed'));
      } finally {
        if (!cancelled) setRevealing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, tKeys]);

  async function copyBaseUrl() {
    try {
      await navigator.clipboard.writeText(API_BASE_URL);
      setBaseCopied(true);
      toast.success(t('baseUrl.copied'));
      window.setTimeout(() => setBaseCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <div className="space-y-6">
      {/* Base URL hero card */}
      <section className="rounded-md border bg-gradient-to-br from-card/80 to-card/40 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t('baseUrl.title')}
          </h2>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
            {t('baseUrl.beta')}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('baseUrl.subtitle')}</p>
        <div className="mt-4 flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3">
          <code className="flex-1 truncate font-mono text-sm">{API_BASE_URL}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyBaseUrl}
            className="shrink-0 gap-1.5"
          >
            {baseCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {baseCopied ? t('baseUrl.copied') : t('baseUrl.copy')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground/70">{t('baseUrl.betaHint')}</p>
      </section>

      {/* Token picker */}
      <section className="rounded-md border bg-card/60 p-6 backdrop-blur-sm">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t('tokenPicker.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('tokenPicker.subtitle')}
        </p>

        {tokens === null ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('tokenPicker.noTokens')}</span>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {tokens.map((tok) => (
              <button
                key={tok.id}
                type="button"
                onClick={() => setSelectedId(tok.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition',
                  selectedId === tok.id
                    ? 'border-ink bg-canvas-soft text-ink'
                    : 'border-border bg-card hover:bg-accent',
                )}
              >
                {tok.name}
              </button>
            ))}
            {revealing && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
              </span>
            )}
          </div>
        )}
      </section>

      {/* Tool cards */}
      <section className="grid gap-4 md:grid-cols-2">
        {TOOL_ORDER.map((toolId) => (
          <ToolGuideCard key={toolId} toolId={toolId} token={revealed} />
        ))}
      </section>
    </div>
  );
}
