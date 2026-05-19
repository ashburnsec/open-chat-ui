import { describe, it, expect } from 'vitest';
import { isInternalTokenName } from './usage-source';

// `isInternalTokenName` is the single source of truth for "did we mint
// this token, or did the user?" It powers three call sites
// (KeysPanel, HowToPanel, UsagePanel) — drift here would make
// internal tokens leak into the user-facing key list, or worse: a
// user-named "playground-something" key get hidden from its owner.

describe('isInternalTokenName', () => {
  it('matches webchat exactly (current internal token name)', () => {
    expect(isInternalTokenName('webchat')).toBe(true);
  });

  it('matches chat-portal-default (legacy internal token name)', () => {
    expect(isInternalTokenName('chat-portal-default')).toBe(true);
  });

  it('matches the playground- prefix (new-api auto-mints these)', () => {
    expect(isInternalTokenName('playground-default')).toBe(true);
    expect(isInternalTokenName('playground-foo-123')).toBe(true);
    expect(isInternalTokenName('playground-')).toBe(true);
  });

  it('rejects ordinary user-created token names', () => {
    expect(isInternalTokenName('cc-test')).toBe(false);
    expect(isInternalTokenName('cursor-personal')).toBe(false);
    expect(isInternalTokenName('My API Key')).toBe(false);
  });

  it('rejects substrings — must match exact or use the prefix', () => {
    // A user is allowed to name their own key "mywebchat"; we don't
    // want to swallow it just because "webchat" appears as a suffix.
    expect(isInternalTokenName('mywebchat')).toBe(false);
    expect(isInternalTokenName('webchat-2')).toBe(false);
    // "playground" without trailing dash isn't the prefix we mean.
    expect(isInternalTokenName('playground')).toBe(false);
    expect(isInternalTokenName('myplayground-x')).toBe(false);
  });

  it('rejects empty / null / undefined inputs', () => {
    expect(isInternalTokenName('')).toBe(false);
    expect(isInternalTokenName(null)).toBe(false);
    expect(isInternalTokenName(undefined)).toBe(false);
  });

  it('is case-sensitive — upstream stores names verbatim', () => {
    // new-api is case-sensitive when matching token_name in /log/self
    // queries, so our identification needs to be too. A user-named
    // "Webchat" should not be hidden.
    expect(isInternalTokenName('Webchat')).toBe(false);
    expect(isInternalTokenName('WEBCHAT')).toBe(false);
  });
});
