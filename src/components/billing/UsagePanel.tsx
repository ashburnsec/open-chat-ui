'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { isInternalTokenName } from '@/lib/usage-source';
import {
  serializeLogsToCsv,
  triggerCsvDownload,
  type CsvLogEntry,
} from '@/lib/usage-csv';
import type { Token } from '@/lib/newapi-client';

type LogEntry = {
  id: number;
  created_at: number;
  type: number;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  quota: number;
  is_stream: boolean;
  token_name: string;
  use_time: number;
  channel: number;
};

type DataPoint = {
  model_name: string;
  /** Unix seconds of bucket start (day boundary). */
  created_at: number;
  token_used: number;
  count: number;
  quota: number;
};

type Stat = { quota: number; rpm: number; tpm: number };

// `isInternalTokenName` lives in `lib/usage-source.ts` now (M24-D3) so
// KeysPanel, HowToPanel, and this file can't drift in their definitions.

const RANGES: Array<{ tKey: 'last7' | 'last30' | 'last90'; days: number }> = [
  { tKey: 'last7', days: 7 },
  { tKey: 'last30', days: 30 },
  { tKey: 'last90', days: 90 },
];

/**
 * /usage page. Three sections:
 *   - 4 KPI cards (spend USD, requests, prompt tokens, completion tokens)
 *   - Stacked bar chart by day (one bar per day, segments per model)
 *   - Recent calls table (20 rows, paginated server-side via /api/log/self)
 *
 * No chart library — we hand-roll SVG. Recharts would add ~150KB and we
 * only need one chart shape; revisit if /usage gains more visualisations.
 */
type Source = 'all' | 'token';

export function UsagePanel({ quotaPerUnit }: { quotaPerUnit: number }) {
  const t = useTranslations('usage');
  const [days, setDays] = useState(7);
  const [source, setSource] = useState<Source>('all');
  const [tokenName, setTokenName] = useState<string>('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [stat, setStat] = useState<Stat | null>(null);
  const [points, setPoints] = useState<DataPoint[] | null>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  // M24-D3: load user-owned tokens once for the "by-key" picker. We
  // filter out internal tokens — same rule as KeysPanel — because
  // those represent our own minting (webchat / playground-*), not
  // something the user can meaningfully target a usage filter on
  // (the "all" view already covers them).
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
        if (!cancelled) setTokens(items.filter((tk) => !isInternalTokenName(tk.name)));
      } catch {
        /* noop — picker stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // "By Key" tab without a selection is a no-op — wait for the user
    // to pick one rather than fire requests against an unset filter.
    if (source === 'token' && !tokenName) {
      setStat(null);
      setPoints([]);
      setLogs([]);
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const now = Math.floor(Date.now() / 1000);
        const start = now - days * 86400;
        const tokenQuery =
          source === 'token' && tokenName
            ? `&token_name=${encodeURIComponent(tokenName)}`
            : '';
        const params = `start_timestamp=${start}&end_timestamp=${now}&type=2${tokenQuery}`;

        const [s, d, l] = await Promise.all([
          fetch(`/api/newapi/api/log/self/stat?${params}`).then((r) => r.json()),
          fetch(
            `/api/newapi/api/data/self?${params}&default_time=day&data_export_default_time=day`,
          ).then((r) => r.json()),
          fetch(`/api/newapi/api/log/self?${params}&p=0&size=20`).then((r) => r.json()),
        ]);

        if (s?.success && s.data) setStat(s.data);
        const dataItems = Array.isArray(d?.data)
          ? (d.data as DataPoint[])
          : (d?.data?.items ?? []);
        setPoints(dataItems);
        const logItems = Array.isArray(l?.data) ? l.data : (l?.data?.items ?? []);
        setLogs(logItems as LogEntry[]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [days, source, tokenName]);

  const tokenSums = useMemo(() => {
    let pt = 0;
    let ct = 0;
    let n = 0;
    for (const l of logs ?? []) {
      pt += l.prompt_tokens || 0;
      ct += l.completion_tokens || 0;
      n += 1;
    }
    return { pt, ct, n };
  }, [logs]);

  // M25-B: pull up to 1000 rows for the current filter, serialize, and
  // download. Separate from the table fetch (which only needs 20)
  // because we don't want to slow the table down for users who never
  // export.
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const start = now - days * 86400;
      const tokenQuery =
        source === 'token' && tokenName
          ? `&token_name=${encodeURIComponent(tokenName)}`
          : '';
      const r = await fetch(
        `/api/newapi/api/log/self?start_timestamp=${start}&end_timestamp=${now}&type=2${tokenQuery}&p=0&size=1000`,
        { cache: 'no-store' },
      );
      const j = await r.json();
      const items = Array.isArray(j?.data)
        ? (j.data as CsvLogEntry[])
        : ((j?.data?.items as CsvLogEntry[]) ?? []);
      if (items.length === 0) {
        toast.message(t('export.empty'));
        return;
      }
      const csv = serializeLogsToCsv(items, {
        headers: {
          time: t('export.headers.time'),
          model: t('export.headers.model'),
          tokenName: t('export.headers.tokenName'),
          promptTokens: t('export.headers.promptTokens'),
          completionTokens: t('export.headers.completionTokens'),
          elapsedSec: t('export.headers.elapsedSec'),
          costUsd: t('export.headers.costUsd'),
        },
        quotaPerUnit,
        internalTokenLabel: t('recent.tokenWebchat'),
      });
      const fromIso = new Date(start * 1000).toISOString().slice(0, 10);
      const toIso = new Date(now * 1000).toISOString().slice(0, 10);
      triggerCsvDownload(`usage-${fromIso}-to-${toIso}.csv`, csv);
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? 'default' : 'outline'}
              onClick={() => setDays(r.days)}
              disabled={loading}
            >
              {t(`range.${r.tKey}` as const)}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={loading || exporting || logs === null}
            title={t('export.limitHint')}
            className="ml-1 gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? t('export.exporting') : t('export.button')}
          </Button>
        </div>
      </div>

      {/* M24-D3: source filter — All vs By API key. Pricing/data
       *  endpoints upstream only support exact `token_name` match (no
       *  wildcard), so loose buckets like "any user-owned key" would
       *  need client-side aggregation we don't have yet — out of M24
       *  scope. */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={source}
          onValueChange={(v) => setSource(v as Source)}
          className="w-auto"
        >
          <TabsList className="h-9 gap-1 rounded-lg bg-muted/60 p-1">
            <TabsTrigger value="all" className="rounded-md px-3 text-xs">
              {t('tabs.all')}
            </TabsTrigger>
            <TabsTrigger value="token" className="rounded-md px-3 text-xs">
              {t('tabs.byToken')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {source === 'token' && (
          <>
            {tokens.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('tokenSelect.empty')}
              </span>
            ) : (
              <select
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="h-9 rounded-md border bg-card px-3 text-xs"
                aria-label={t('tokenSelect.label')}
              >
                <option value="">{t('tokenSelect.placeholder')}</option>
                {tokens.map((tk) => (
                  <option key={tk.id} value={tk.name}>
                    {tk.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label={t('kpi.totalSpent')}
          value={stat ? `$${(stat.quota / quotaPerUnit).toFixed(4)}` : '—'}
          hint={t('kpi.totalSpentHint', { days })}
          loading={loading}
        />
        <KpiCard
          label={t('kpi.calls')}
          value={stat ? `${tokenSums.n}+` : '—'}
          hint={t('kpi.callsHint')}
          loading={loading}
        />
        <KpiCard
          label={t('kpi.inputTokens')}
          value={tokenSums.pt.toLocaleString()}
          hint={t('kpi.last20Hint')}
          loading={loading}
        />
        <KpiCard
          label={t('kpi.outputTokens')}
          value={tokenSums.ct.toLocaleString()}
          hint={t('kpi.last20Hint')}
          loading={loading}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium">{t('chart.title')}</span>
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <DailyChart points={points ?? []} days={days} quotaPerUnit={quotaPerUnit} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2 text-sm font-medium">{t('recent.title')}</div>
          {logs === null ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('recent.loading')}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {t('recent.empty')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('recent.colTime')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('recent.colModel')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('recent.colToken')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('recent.colInput')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('recent.colOutput')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('recent.colElapsed')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('recent.colSpent')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(l.created_at * 1000).toLocaleString(undefined, { hour12: false })}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {l.model_name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.token_name ? (
                        isInternalTokenName(l.token_name) ? (
                          <span title={l.token_name}>{t('recent.tokenWebchat')}</span>
                        ) : (
                          l.token_name
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.prompt_tokens?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.completion_tokens?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {l.use_time != null ? `${(l.use_time / 1000).toFixed(2)}s` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      ${(l.quota / quotaPerUnit).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-2xl font-semibold tabular-nums', loading && 'opacity-60')}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Stacked bar chart, hand-rolled SVG.
 * Reorganises `points[]` (one row per (model, day)) into per-day buckets
 * with model segments. Buckets that span the whole window are emitted so
 * empty days still render as zero-height columns (clearer than gaps).
 */
function DailyChart({
  points,
  days,
  quotaPerUnit,
}: {
  points: DataPoint[];
  days: number;
  quotaPerUnit: number;
}) {
  const buckets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneDay = 86_400_000;
    const start = today.getTime() - (days - 1) * oneDay;
    // Pre-fill window with empty buckets keyed by day.
    const map = new Map<number, { date: number; total: number; bySeg: Record<string, number> }>();
    for (let i = 0; i < days; i++) {
      const d = start + i * oneDay;
      map.set(d, { date: d, total: 0, bySeg: {} });
    }
    for (const p of points) {
      const day = new Date(p.created_at * 1000);
      day.setHours(0, 0, 0, 0);
      const key = day.getTime();
      const slot = map.get(key);
      if (!slot) continue; // outside the chosen window
      const usd = p.quota / quotaPerUnit;
      slot.total += usd;
      slot.bySeg[p.model_name] = (slot.bySeg[p.model_name] ?? 0) + usd;
    }
    return Array.from(map.values());
  }, [points, days, quotaPerUnit]);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 0.0001);

  // Build a stable colour palette keyed by the alphabetical order of all
  // models seen in the window. Simple HSL ring keeps adjacency readable.
  const allModels = useMemo(() => {
    const set = new Set<string>();
    for (const b of buckets) for (const k of Object.keys(b.bySeg)) set.add(k);
    return Array.from(set).sort();
  }, [buckets]);
  const colorOf = (m: string) => {
    const i = allModels.indexOf(m);
    return `hsl(${(i * 47) % 360} 70% 55%)`;
  };

  const W = 720;
  const H = 180;
  const PAD_X = 32;
  const PAD_Y = 12;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2 - 14; // 14px reserved for x-axis labels
  const barW = innerW / buckets.length;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="h-44"
          style={{ minWidth: Math.max(420, days * 24) }}
        >
          {/* y-axis ticks (max + 50% + 0) */}
          {[1, 0.5, 0].map((frac) => {
            const y = PAD_Y + innerH * (1 - frac);
            return (
              <g key={frac}>
                <line
                  x1={PAD_X}
                  x2={W - PAD_X}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeDasharray="2,2"
                />
                <text x={4} y={y + 3} fontSize={9} fill="currentColor" fillOpacity={0.6}>
                  ${(maxTotal * frac).toFixed(2)}
                </text>
              </g>
            );
          })}
          {buckets.map((b, idx) => {
            const x = PAD_X + idx * barW + barW * 0.15;
            const w = barW * 0.7;
            let acc = 0;
            // Render segments bottom-up, in stable colour order.
            const segs = allModels
              .filter((m) => b.bySeg[m])
              .map((m) => ({ m, v: b.bySeg[m] }));
            return (
              <g key={b.date}>
                {segs.map((s) => {
                  const segH = (s.v / maxTotal) * innerH;
                  const y = PAD_Y + innerH - acc - segH;
                  acc += segH;
                  return (
                    <rect
                      key={s.m}
                      x={x}
                      y={y}
                      width={w}
                      height={segH}
                      fill={colorOf(s.m)}
                      opacity={0.85}
                    >
                      <title>{`${new Date(b.date).toLocaleDateString()}\n${s.m}: $${s.v.toFixed(4)}`}</title>
                    </rect>
                  );
                })}
                {idx % Math.max(1, Math.ceil(days / 7)) === 0 && (
                  <text
                    x={x + w / 2}
                    y={PAD_Y + innerH + 11}
                    fontSize={9}
                    textAnchor="middle"
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {new Date(b.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {allModels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {allModels.map((m) => (
            <span key={m} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: colorOf(m) }} />
              <span className="font-mono text-muted-foreground">{m}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
