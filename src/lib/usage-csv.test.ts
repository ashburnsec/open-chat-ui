// @vitest-environment node
//
// CSV export for /usage. Two things have a real chance of biting us:
//
//   1. Field escaping. A model name with a comma, a token name with a
//      quote, a multi-line note — all need to round-trip through
//      `csvField` without breaking column alignment.
//
//   2. Formula injection (OWASP CWE-1236). A user-named token like
//      `=cmd|' /C calc'!A0` would execute on Excel open without the
//      leading-quote guard. We only test that the prefix is added —
//      the actual escape semantics are Excel's, not ours.
//
// We don't `triggerCsvDownload` here — it touches DOM (Blob /
// document.createElement). Pure-string serialization is the part that
// can go wrong silently; download is just a wrapper.

import { describe, it, expect } from 'vitest';
import { serializeLogsToCsv, type CsvHeaders, type CsvLogEntry } from './usage-csv';

const HEADERS: CsvHeaders = {
  time: 'Time',
  model: 'Model',
  tokenName: 'Token',
  promptTokens: 'Input tokens',
  completionTokens: 'Output tokens',
  elapsedSec: 'Elapsed (s)',
  costUsd: 'Cost (USD)',
};

const baseOpts = {
  headers: HEADERS,
  quotaPerUnit: 500_000,
  internalTokenLabel: 'Web Chat',
};

function row(over: Partial<CsvLogEntry> = {}): CsvLogEntry {
  return {
    created_at: 1714521600, // 2024-05-01 00:00:00Z
    model_name: 'gpt-5.4',
    token_name: 'cc-test',
    prompt_tokens: 100,
    completion_tokens: 200,
    use_time: 1500,
    quota: 5000,
    ...over,
  };
}

describe('serializeLogsToCsv', () => {
  it('emits header row + one data row in RFC 4180 (CRLF) format', () => {
    const csv = serializeLogsToCsv([row()], baseOpts);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'Time,Model,Token,Input tokens,Output tokens,Elapsed (s),Cost (USD)',
    );
    // Cost: 5000 / 500000 = 0.01 → "0.010000"
    expect(lines[1]).toContain('gpt-5.4');
    expect(lines[1]).toContain('cc-test');
    expect(lines[1]).toContain('0.010000');
  });

  it('formats timestamp as ISO 8601 UTC', () => {
    const csv = serializeLogsToCsv([row({ created_at: 1714521600 })], baseOpts);
    expect(csv).toContain('2024-05-01T00:00:00.000Z');
  });

  it('rewrites internal token names through the friendly label', () => {
    const csv = serializeLogsToCsv(
      [row({ token_name: 'webchat' }), row({ token_name: 'playground-default' })],
      baseOpts,
    );
    // Both internal names get the same display label
    expect(csv.match(/Web Chat/g)?.length ?? 0).toBe(2);
    expect(csv).not.toContain('webchat');
    expect(csv).not.toContain('playground-default');
  });

  it('preserves user token names unchanged', () => {
    const csv = serializeLogsToCsv([row({ token_name: 'my-cli' })], baseOpts);
    expect(csv).toContain('my-cli');
  });

  it('quotes fields containing commas (model name with parenthesised note)', () => {
    const csv = serializeLogsToCsv(
      [row({ model_name: 'gpt-5.4 (preview, beta)' })],
      baseOpts,
    );
    expect(csv).toContain('"gpt-5.4 (preview, beta)"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    const csv = serializeLogsToCsv([row({ token_name: 'name "x"' })], baseOpts);
    // RFC 4180: embedded `"` → `""`, whole field wrapped in `"…"`
    expect(csv).toContain('"name ""x"""');
  });

  it('quotes fields containing newlines', () => {
    const csv = serializeLogsToCsv([row({ token_name: 'two\nlines' })], baseOpts);
    expect(csv).toContain('"two\nlines"');
    // Header row still ends at first \r\n
    const firstLineEnd = csv.indexOf('\r\n');
    expect(firstLineEnd).toBeGreaterThan(0);
  });

  it('defangs leading = / + / - / @ to prevent CSV formula injection', () => {
    const csv = serializeLogsToCsv(
      [
        row({ token_name: '=cmd|x' }),
        row({ token_name: '+1+2' }),
        row({ token_name: '-startup' }),
        row({ token_name: '@SUM(A1)' }),
      ],
      baseOpts,
    );
    expect(csv).toContain("'=cmd|x");
    expect(csv).toContain("'+1+2");
    expect(csv).toContain("'-startup");
    expect(csv).toContain("'@SUM(A1)");
  });

  it('does not defang ordinary token names that happen to contain these chars later', () => {
    const csv = serializeLogsToCsv([row({ token_name: 'a=b+c' })], baseOpts);
    // Only the first character matters for the formula-injection prefix.
    expect(csv).toContain('a=b+c');
    expect(csv).not.toContain("'a=b+c");
  });

  it('handles empty log array — header only', () => {
    const csv = serializeLogsToCsv([], baseOpts);
    expect(csv).toBe(
      'Time,Model,Token,Input tokens,Output tokens,Elapsed (s),Cost (USD)',
    );
  });

  it('falls back to "" for missing token_name (rare but possible upstream)', () => {
    const csv = serializeLogsToCsv(
      [row({ token_name: '' as unknown as string })],
      baseOpts,
    );
    // Token column is empty (two consecutive commas around it).
    expect(csv.split('\r\n')[1]).toMatch(/gpt-5\.4,,/);
  });

  it('cost field is empty when quotaPerUnit is 0 (defensive against bad config)', () => {
    const csv = serializeLogsToCsv([row()], { ...baseOpts, quotaPerUnit: 0 });
    // Last column for the data row should be empty
    const dataRow = csv.split('\r\n')[1]!;
    expect(dataRow.endsWith(',')).toBe(true);
  });

  it('elapsed field is empty when use_time is missing', () => {
    const csv = serializeLogsToCsv(
      [row({ use_time: NaN })],
      baseOpts,
    );
    // Elapsed cell should render as the empty string between commas.
    expect(csv).toMatch(/,,0\.010000$/);
  });

  it('keeps numeric token counts intact (no thousands separators)', () => {
    const csv = serializeLogsToCsv(
      [row({ prompt_tokens: 1234567, completion_tokens: 8901234 })],
      baseOpts,
    );
    expect(csv).toContain('1234567');
    expect(csv).toContain('8901234');
    expect(csv).not.toContain('1,234,567');
  });
});
