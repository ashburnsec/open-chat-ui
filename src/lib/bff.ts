/**
 * Shared helpers for BFF route handlers — origin/CSRF check, error envelope,
 * upstream URL resolution.
 */
import { NextResponse } from 'next/server';

export const NEWAPI_INTERNAL_URL = process.env.NEWAPI_INTERNAL_URL ?? 'http://localhost:3000';
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3001';

/**
 * Lightweight CSRF defence: reject unsafe methods that don't carry a same-
 * origin Origin header. Browsers always send Origin on POST/PUT/DELETE; the
 * absence of one is a strong signal of a curl / cross-origin attack.
 */
export function ensureSameOrigin(req: Request): NextResponse | null {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const origin = req.headers.get('origin');
  if (!origin) {
    return NextResponse.json({ success: false, message: 'missing Origin header' }, { status: 403 });
  }
  // Allow exact match. In dev we accept the configured app origin; in prod
  // a reverse proxy (Caddy) ensures this matches the public URL.
  const allowed = new Set([APP_ORIGIN]);
  if (process.env.NODE_ENV === 'development') {
    allowed.add('http://localhost:3001');
    allowed.add('http://127.0.0.1:3001');
  }
  if (!allowed.has(origin)) {
    return NextResponse.json(
      { success: false, message: `origin ${origin} not allowed` },
      { status: 403 },
    );
  }
  return null;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * M18-M2: validate a `?next=` redirect parameter and return either the
 * sanitized path or the safe fallback `/`.
 *
 * Naive `next.startsWith('/')` is bypassed by:
 *   - `//evil.com/foo`           (protocol-relative URL → cross-origin)
 *   - `/\\evil.com/foo`          (some old browsers normalise to `//`)
 *   - `/%2F%2Fevil.com`          (when a downstream consumer URL-decodes)
 *   - `javascript:...`           (rejected by the leading `/` check, OK)
 *
 * Required shape:
 *   - non-empty, ≤ 2048 chars
 *   - starts with exactly one `/` (and the next char isn't `/` or `\\`)
 *   - no backslashes anywhere (historical browser quirk)
 *   - no control / NUL bytes
 *
 * Use anywhere a `next` parameter ends up in router.replace / Link href.
 */
export function safeNextPath(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string') return fallback;
  if (next.length === 0 || next.length > 2048) return fallback;
  if (next[0] !== '/') return fallback;
  if (next[1] === '/' || next[1] === '\\') return fallback;
  if (next.includes('\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(next)) return fallback;
  return next;
}
