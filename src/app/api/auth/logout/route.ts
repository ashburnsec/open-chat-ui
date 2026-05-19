import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ensureSameOrigin, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { clearSessionCookie, SESSION_COOKIE_NAME, UID_COOKIE_NAME } from '@/lib/cookie';
import { clearUserApiTokenCache } from '@/lib/user-token';

export const runtime = 'nodejs';

/**
 * POST /api/auth/logout — invalidate upstream session AND clear our cookie.
 * Always succeeds locally even if upstream fails (we still want the client
 * to forget its credential).
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const uidStr = store.get(UID_COOKIE_NAME)?.value;

  // Best-effort upstream logout. new-api invalidates the session-store entry.
  if (session) {
    try {
      await fetch(`${NEWAPI_INTERNAL_URL}/api/user/logout`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${session}` },
      });
    } catch {
      // ignore — we still clear locally
    }
  }

  // M18-H2: drop the user's plaintext API key from the in-process token
  // cache so a later login as a different user on the same Next.js
  // worker doesn't inherit this user's mint. Idempotent — safe even
  // when the cache had no entry.
  const uid = uidStr ? Number(uidStr) : NaN;
  if (Number.isInteger(uid) && uid > 0) clearUserApiTokenCache(uid);

  const res = NextResponse.json({ success: true, message: '' });
  clearSessionCookie(res);
  return res;
}
