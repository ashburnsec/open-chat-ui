/**
 * Helpers to translate the new-api `Set-Cookie` (SameSite=Strict, host-only)
 * into a same-origin cookie our browser will happily attach to subsequent
 * BFF requests.
 *
 * We deliberately do NOT trust upstream's SameSite/Domain — we mint our
 * own attributes so the cookie behaves correctly for the chat-portal origin.
 */

import type { NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'session';
/**
 * Companion cookie holding the upstream user ID. new-api requires every
 * authenticated /api/* call to carry `New-Api-User: <id>` matching the
 * session — see `new-api/middleware/auth.go:96`. We can't decrypt the
 * session cookie ourselves, so we cache the id in a separate cookie set
 * on login. Not security-sensitive (the session cookie is the actual
 * credential), so it's not HttpOnly.
 */
export const UID_COOKIE_NAME = 'uid';

export type ParsedSetCookie = {
  name: string;
  value: string;
  maxAge?: number;
};

/**
 * Parse one Set-Cookie header value. Returns null if it isn't the new-api
 * `session` cookie or the value is empty.
 */
export function parseNewApiSessionCookie(setCookie: string): ParsedSetCookie | null {
  const parts = setCookie.split(';').map((s) => s.trim());
  const first = parts[0];
  const eq = first.indexOf('=');
  if (eq < 0) return null;
  const name = first.slice(0, eq);
  const value = first.slice(eq + 1);
  if (name !== SESSION_COOKIE_NAME || !value) return null;

  let maxAge: number | undefined;
  for (const p of parts.slice(1)) {
    const [k, v] = p.split('=');
    if (k.toLowerCase() === 'max-age' && v) {
      const n = Number(v);
      if (!Number.isNaN(n)) maxAge = n;
    }
  }
  return { name, value, maxAge };
}

/**
 * Pull every Set-Cookie header out of an upstream Response. Uses the
 * Next.js / Undici-style `getSetCookie()` API which preserves duplicates
 * (a single `headers.get('set-cookie')` collapses them).
 */
export function extractSetCookies(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

export type SetSessionOptions = {
  /** Override domain. Empty string / undefined → host-only cookie. */
  domain?: string;
  /** Defaults to NODE_ENV === 'production'. */
  secure?: boolean;
};

/**
 * Set the session cookie on the outgoing NextResponse using same-origin
 * SameSite=Lax so it rides on top-level navigations (OAuth callback) but
 * stays safely out of cross-site POSTs.
 */
export function setSessionCookie(
  response: NextResponse,
  cookie: ParsedSetCookie,
  opts: SetSessionOptions = {},
): void {
  const domain = opts.domain ?? process.env.SESSION_COOKIE_DOMAIN ?? '';
  const secure =
    opts.secure ??
    (process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production');

  response.cookies.set({
    name: cookie.name,
    value: cookie.value,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: cookie.maxAge,
    ...(domain ? { domain } : {}),
  });
}

/**
 * Take the upstream response, find its session Set-Cookie, and write it to
 * our outgoing response. No-op if upstream didn't set one (e.g. failed login).
 */
export function rewriteSessionFromUpstream(
  upstreamHeaders: Headers,
  response: NextResponse,
  opts?: SetSessionOptions,
): boolean {
  for (const raw of extractSetCookies(upstreamHeaders)) {
    const parsed = parseNewApiSessionCookie(raw);
    if (parsed) {
      setSessionCookie(response, parsed, opts);
      return true;
    }
  }
  return false;
}

/**
 * Wipe the session cookie. Used by /api/auth/logout and any 401-recovery path.
 */
export function clearSessionCookie(response: NextResponse, opts: SetSessionOptions = {}): void {
  const domain = opts.domain ?? process.env.SESSION_COOKIE_DOMAIN ?? '';
  for (const name of [SESSION_COOKIE_NAME, UID_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: '',
      path: '/',
      httpOnly: name === SESSION_COOKIE_NAME,
      sameSite: 'lax',
      secure: opts.secure ?? process.env.NODE_ENV === 'production',
      maxAge: 0,
      ...(domain ? { domain } : {}),
    });
  }
}

/**
 * Set the uid companion cookie. Mirrors the session cookie's lifetime so
 * both expire together — preventing the case where uid lingers without
 * a matching session and confuses passthrough requests.
 */
export function setUidCookie(
  response: NextResponse,
  uid: number | string,
  opts: SetSessionOptions & { maxAge?: number } = {},
): void {
  const domain = opts.domain ?? process.env.SESSION_COOKIE_DOMAIN ?? '';
  const secure =
    opts.secure ??
    (process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production');
  response.cookies.set({
    name: UID_COOKIE_NAME,
    value: String(uid),
    path: '/',
    // M18-M1: previously false. Audited every reader and they're all
    // server-side (apps/web/src/lib/conv.ts, /lib/newapi.ts, the
    // /api/chat + /api/files/* routes). No client JS reads document.cookie
    // for uid, so httpOnly is a free hardening — limits the blast radius
    // of any future XSS to "can't trivially exfil uid" (session cookie
    // is already httpOnly).
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: opts.maxAge ?? 60 * 60 * 24 * 30,
    ...(domain ? { domain } : {}),
  });
}
