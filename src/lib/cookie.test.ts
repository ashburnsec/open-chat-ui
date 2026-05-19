// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractSetCookies, parseNewApiSessionCookie } from './cookie';

describe('parseNewApiSessionCookie', () => {
  it('parses a typical new-api Set-Cookie value', () => {
    const raw = 'session=abc123; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict';
    const out = parseNewApiSessionCookie(raw);
    expect(out).toEqual({ name: 'session', value: 'abc123', maxAge: 2592000 });
  });

  it('handles values that themselves contain "=" (base64 padding)', () => {
    const raw = 'session=MTc3N=='+'; Path=/; HttpOnly';
    const out = parseNewApiSessionCookie(raw);
    expect(out?.value).toBe('MTc3N==');
  });

  it('returns null for non-session cookies', () => {
    expect(parseNewApiSessionCookie('uid=42; Path=/')).toBeNull();
  });

  it('returns null when value is empty (clear-cookie)', () => {
    expect(parseNewApiSessionCookie('session=; Max-Age=0')).toBeNull();
  });

  it('returns null for malformed input (no =)', () => {
    expect(parseNewApiSessionCookie('cookie-monster')).toBeNull();
  });

  it('omits maxAge when not present in the header', () => {
    const out = parseNewApiSessionCookie('session=v; Path=/');
    expect(out).toEqual({ name: 'session', value: 'v', maxAge: undefined });
  });

  it('ignores garbage Max-Age values', () => {
    const out = parseNewApiSessionCookie('session=v; Max-Age=not-a-number');
    expect(out?.maxAge).toBeUndefined();
  });
});

describe('extractSetCookies', () => {
  it('returns multiple Set-Cookie entries via getSetCookie() (modern undici)', () => {
    const h = new Headers();
    h.append('set-cookie', 'a=1; Path=/');
    h.append('set-cookie', 'b=2; Path=/');
    const out = extractSetCookies(h);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^a=1/);
    expect(out[1]).toMatch(/^b=2/);
  });

  it('falls back to .get() when getSetCookie is missing', () => {
    // Synthesise a Headers-like object with only `.get`. Cast as Headers
    // so the helper takes the fallback path.
    const fake = {
      get: (name: string) => (name === 'set-cookie' ? 'only=1; Path=/' : null),
    } as unknown as Headers;
    const out = extractSetCookies(fake);
    expect(out).toEqual(['only=1; Path=/']);
  });

  it('returns [] when no cookies present', () => {
    expect(extractSetCookies(new Headers())).toEqual([]);
  });
});
