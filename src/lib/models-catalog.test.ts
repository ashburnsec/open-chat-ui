// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  MODELS_CATALOG,
  findModelEntry,
  resolveModelId,
  groupByDisplayName,
  stripChannelSuffix,
} from './models-catalog';

describe('catalog integrity', () => {
  it('every id is unique', () => {
    const ids = MODELS_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('no entry id contains the legacy __ mangle suffix', () => {
    for (const e of MODELS_CATALOG) {
      expect(e.id, `entry ${e.id}`).not.toContain('__');
    }
  });
  it('every displayName is unique (post-collapse)', () => {
    const names = MODELS_CATALOG.map((e) => e.displayName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('findModelEntry', () => {
  it('returns the entry for a known bare id', () => {
    expect(findModelEntry('gpt-5.4')?.displayName).toBe('GPT-5.4');
    expect(findModelEntry('gpt-5.5')?.vendor).toBe('openai');
    expect(findModelEntry('Phi-4')?.vendor).toBe('microsoft');
  });
  it('returns undefined for an unknown id', () => {
    expect(findModelEntry('nonexistent-model')).toBeUndefined();
  });
  it('returns undefined for legacy mangled ids (caller must resolveModelId first)', () => {
    expect(findModelEntry('gpt-5.4__azure')).toBeUndefined();
  });
});

describe('resolveModelId', () => {
  it('strips __suffix from legacy mangled ids', () => {
    expect(resolveModelId('gpt-5.4__azure')).toBe('gpt-5.4');
    expect(resolveModelId('gpt-5.5__std')).toBe('gpt-5.5');
    expect(resolveModelId('gpt-5.3-codex__azure')).toBe('gpt-5.3-codex');
  });
  it('passes through bare names that exist in catalog', () => {
    expect(resolveModelId('claude-opus-4-7')).toBe('claude-opus-4-7');
    expect(resolveModelId('Phi-4')).toBe('Phi-4');
    expect(resolveModelId('gpt-5.4')).toBe('gpt-5.4');
  });
  it('passes through unknown bare names', () => {
    expect(resolveModelId('mystery-model-7')).toBe('mystery-model-7');
  });
  it('handles null/undefined/empty', () => {
    expect(resolveModelId(null)).toBe('');
    expect(resolveModelId(undefined)).toBe('');
    expect(resolveModelId('')).toBe('');
  });
});

describe('stripChannelSuffix', () => {
  it('removes the __hint suffix', () => {
    expect(stripChannelSuffix('gpt-5.4__azure')).toBe('gpt-5.4');
    expect(stripChannelSuffix('gpt-5.4-pro__foundry')).toBe('gpt-5.4-pro');
  });
  it('passes through bare names', () => {
    expect(stripChannelSuffix('claude-opus-4-7')).toBe('claude-opus-4-7');
    expect(stripChannelSuffix('Phi-4')).toBe('Phi-4');
  });
});

describe('groupByDisplayName', () => {
  it('returns one group per id with a single variant', () => {
    const groups = groupByDisplayName(['gpt-5.4', 'gpt-5.5']);
    expect(groups).toHaveLength(2);
    expect(groups[0].displayName).toBe('GPT-5.4');
    expect(groups[0].variants).toHaveLength(1);
    expect(groups[1].displayName).toBe('GPT-5.5');
    expect(groups[1].variants).toHaveLength(1);
  });
  it('keeps unique models as a single-variant group', () => {
    const groups = groupByDisplayName(['claude-opus-4-7', 'Phi-4']);
    expect(groups).toHaveLength(2);
    expect(groups[0].variants).toHaveLength(1);
    expect(groups[1].variants).toHaveLength(1);
  });
  it('synthesises an unknown entry rather than dropping it', () => {
    const groups = groupByDisplayName(['mystery-1234']);
    expect(groups).toHaveLength(1);
    expect(groups[0].displayName).toBe('mystery-1234');
    expect(groups[0].vendor).toBe('unknown');
  });
  it('preserves first-seen order across groups', () => {
    const groups = groupByDisplayName(['Phi-4', 'gpt-5.4', 'claude-opus-4-7']);
    expect(groups.map((g) => g.displayName)).toEqual([
      'Phi-4',
      'GPT-5.4',
      'Claude Opus 4.7',
    ]);
  });
});
