'use client';

/**
 * Usage-log CSV export (M25-B). Two responsibilities:
 *
 *   1. Serialize an array of upstream LogEntry rows into RFC 4180 CSV
 *      with a UTF-8 BOM (so Excel doesn't garble Chinese model /
 *      token names — without BOM it defaults to GBK on zh locales).
 *
 *   2. Defang the OWASP-classic "CSV formula injection" — fields that
 *      start with `=` `+` `-` `@` get a leading `'` so Excel treats
 *      them as text, not formulas. A user-named token like
 *      `=cmd|' /C calc'!A0` would otherwise pop a calculator on
 *      open. Cheap mitigation, costs us nothing.
 *
 * Cost is taken straight from `quota / quotaPerUnit` rather than the
 * pricing-cache estimator — that's the source new-api itself bills
 * against, so the CSV always matches the user's wallet.
 */

import { isInternalTokenName } from './usage-source';

export type CsvLogEntry = {
  created_at: number;
  model_name: string;
  token_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  use_time: number;
  quota: number;
};

export type CsvHeaders = {
  time: string;
  model: string;
  tokenName: string;
  promptTokens: string;
  completionTokens: string;
  elapsedSec: string;
  costUsd: string;
};

/** RFC 4180 escape: wrap in `"…"` whenever the field contains `,` /
 *  `"` / `\r` / `\n`, doubling any embedded quote. Plus the OWASP
 *  formula-injection guard at the front. */
function csvField(raw: string | number): string {
  let s = typeof raw === 'number' ? String(raw) : raw;
  if (s.length === 0) return '';
  // Formula-injection guard. Spec lists `= + - @` as triggers; some
  // sources also include tab/CR which we'd quote anyway.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build the multi-line CSV body (no BOM yet — added at download
 *  time). Token names are friendly-mapped through usage-source so
 *  internal ones show up as the user-facing label rather than `webchat`. */
export function serializeLogsToCsv(
  logs: readonly CsvLogEntry[],
  opts: {
    headers: CsvHeaders;
    quotaPerUnit: number;
    /** Translation for the friendly internal-token label (e.g. "Web Chat"). */
    internalTokenLabel: string;
  },
): string {
  const { headers, quotaPerUnit, internalTokenLabel } = opts;
  const lines: string[] = [];
  lines.push(
    [
      headers.time,
      headers.model,
      headers.tokenName,
      headers.promptTokens,
      headers.completionTokens,
      headers.elapsedSec,
      headers.costUsd,
    ]
      .map(csvField)
      .join(','),
  );
  for (const l of logs) {
    const friendlyToken = isInternalTokenName(l.token_name)
      ? internalTokenLabel
      : (l.token_name ?? '');
    const elapsedSec =
      typeof l.use_time === 'number' && !Number.isNaN(l.use_time)
        ? (l.use_time / 1000).toFixed(2)
        : '';
    const costUsd =
      quotaPerUnit > 0 && typeof l.quota === 'number'
        ? (l.quota / quotaPerUnit).toFixed(6)
        : '';
    lines.push(
      [
        new Date(l.created_at * 1000).toISOString(),
        l.model_name ?? '',
        friendlyToken,
        l.prompt_tokens ?? 0,
        l.completion_tokens ?? 0,
        elapsedSec,
        costUsd,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

/** Trigger a browser download with the given content. UTF-8 BOM is
 *  prepended so Excel renders non-ASCII fields correctly. */
export function triggerCsvDownload(filename: string, csvBody: string): void {
  const BOM = '﻿';
  const blob = new Blob([BOM + csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the blob asap; some browsers leak the URL otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
