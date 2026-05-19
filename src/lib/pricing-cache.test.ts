// @vitest-environment node
//
// Pricing-cache backs the per-turn cost badge under every assistant
// bubble (M24). Two things need to stay correct:
//
//   1. The conversion formula. Every byte of model_ratio /
//      completion_ratio / model_price has to land in the right place
//      or users see numbers that don't match the /usage page.
//
//   2. The "don't estimate when unsure" contract. When the model isn't
//      priced (cache empty / unknown model / per-call billing), the
//      badge MUST get null back so it falls through to a token-only
//      display. Showing a wrong $ is worse than showing none.
//
// Because the cache lives in module-level state, every test does
// `vi.resetModules()` + `await import()` to start clean.

import { describe, it, expect, beforeEach, vi } from 'vitest';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOnce(payload: unknown): FetchMock {
  const m = vi.fn(async () => ({ json: async () => payload }) as Response);
  vi.stubGlobal('fetch', m);
  return m;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('pricing-cache · cold cache', () => {
  it('getCostUsd returns null on a never-loaded cache', async () => {
    const { getCostUsd } = await import('./pricing-cache');
    expect(getCostUsd('gpt-5.4', 100, 100)).toBeNull();
  });

  it('getCostUsd returns null for empty model name', async () => {
    const { getCostUsd } = await import('./pricing-cache');
    expect(getCostUsd('', 100, 100)).toBeNull();
  });

  it('getCostUsd returns null when fetch fails — never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('gpt-5.4', 100, 100)).toBeNull();
  });

  it('getCostUsd returns null when payload shape is wrong', async () => {
    // Defensive: the upstream changed shape once already (M22 fix). If
    // it changes again the badge should fall back, not blow up.
    mockFetchOnce({ no_data: true });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('gpt-5.4', 100, 100)).toBeNull();
  });
});

describe('pricing-cache · per-token billing math', () => {
  // Anchor numbers we can sanity-check by hand.
  // Constants: $2 per million tokens at ratio = 1.0.
  // Formula   :   in_usd  = prompt × ratio × 2 / 1e6
  //               out_usd = completion × ratio × completion_ratio × 2 / 1e6

  it('computes simple unit-rate model correctly', async () => {
    mockFetchOnce({
      data: [
        {
          model_name: 'unit-1x',
          quota_type: 0,
          model_ratio: 1.0,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    // 1M in + 1M out at 1× = $2 + $2 = $4
    expect(getCostUsd('unit-1x', 1_000_000, 1_000_000)).toBeCloseTo(4, 6);
  });

  it('computes asymmetric in/out ratio (gpt-5.4 shape)', async () => {
    // Realistic fixture: input $2.50/M, output $20/M (ratio 8x).
    // model_ratio = 1.25 → input 1.25 × 2 = $2.50 / M
    // completion_ratio = 8 → output = input × 8 = $20 / M
    mockFetchOnce({
      data: [
        {
          model_name: 'gpt-5.4',
          quota_type: 0,
          model_ratio: 1.25,
          completion_ratio: 8,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    // 1k in  → 1000 × 1.25 × 2 / 1e6 = 0.0025
    // 500 out → 500 × 1.25 × 8 × 2 / 1e6 = 0.01
    // total → 0.0125
    expect(getCostUsd('gpt-5.4', 1000, 500)).toBeCloseTo(0.0125, 8);
  });

  it('handles tiny token counts without precision loss', async () => {
    mockFetchOnce({
      data: [
        {
          model_name: 'cheap',
          quota_type: 0,
          model_ratio: 0.1,
          completion_ratio: 2,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    // 1 token in, 1 token out — vanishingly small but non-zero
    // in:  1 × 0.1 × 2 / 1e6 = 2e-7
    // out: 1 × 0.1 × 2 × 2 / 1e6 = 4e-7
    expect(getCostUsd('cheap', 1, 1)).toBeCloseTo(6e-7, 12);
  });

  it('zero tokens returns zero (not null) when model is priced', async () => {
    // Edge case: assistant turn that errored before producing tokens.
    // We still want the badge to render, just at $0.
    mockFetchOnce({
      data: [
        {
          model_name: 'm',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('m', 0, 0)).toBe(0);
  });
});

describe('pricing-cache · null-out paths (don\'t estimate when unsure)', () => {
  it('returns null for per-call billing (quota_type=1)', async () => {
    // gpt-image-2 etc. — billed per call, not per token. We don't
    // know how to surface the "$0.05/call" right now, so the badge
    // falls back to token-only.
    mockFetchOnce({
      data: [
        {
          model_name: 'gpt-image-2',
          quota_type: 1,
          model_ratio: 0,
          completion_ratio: 0,
          model_price: 0.05,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('gpt-image-2', 100, 100)).toBeNull();
  });

  it('returns null when model_ratio is zero', async () => {
    mockFetchOnce({
      data: [
        {
          model_name: 'free',
          quota_type: 0,
          model_ratio: 0,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('free', 100, 100)).toBeNull();
  });

  it('returns null when model_ratio is negative (corrupt config)', async () => {
    mockFetchOnce({
      data: [
        {
          model_name: 'broken',
          quota_type: 0,
          model_ratio: -1,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('broken', 100, 100)).toBeNull();
  });

  it('returns null for unknown model (cache loaded, model not in catalog)', async () => {
    mockFetchOnce({
      data: [
        {
          model_name: 'gpt-5.4',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('mystery-model', 100, 100)).toBeNull();
  });
});

describe('pricing-cache · loader semantics', () => {
  it('dedupes concurrent ensurePricingLoaded calls', async () => {
    const fetchMock = mockFetchOnce({ data: [] });
    const { ensurePricingLoaded } = await import('./pricing-cache');
    await Promise.all([
      ensurePricingLoaded(),
      ensurePricingLoaded(),
      ensurePricingLoaded(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips re-fetch within TTL on subsequent calls', async () => {
    const fetchMock = mockFetchOnce({
      data: [
        {
          model_name: 'a',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded } = await import('./pricing-cache');
    await ensurePricingLoaded();
    await ensurePricingLoaded();
    await ensurePricingLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('subscribePricing notifies listeners on cache reload', async () => {
    mockFetchOnce({
      data: [
        {
          model_name: 'a',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, subscribePricing, getPricingVersion } =
      await import('./pricing-cache');
    const seenVersions: number[] = [];
    const unsub = subscribePricing(() => seenVersions.push(getPricingVersion()));
    expect(getPricingVersion()).toBe(0);
    await ensurePricingLoaded();
    unsub();
    expect(seenVersions.length).toBeGreaterThanOrEqual(1);
    expect(getPricingVersion()).toBeGreaterThan(0);
  });

  it('skips rows missing model_name (defensive against bad upstream)', async () => {
    mockFetchOnce({
      data: [
        // missing model_name — must not crash, must not pollute cache
        { quota_type: 0, model_ratio: 1, completion_ratio: 1, model_price: 0 },
        {
          model_name: 'good',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          model_price: 0,
        },
      ],
    });
    const { ensurePricingLoaded, getCostUsd } = await import('./pricing-cache');
    await ensurePricingLoaded();
    expect(getCostUsd('good', 1_000_000, 0)).toBeCloseTo(2, 6);
  });
});
