import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ensureSameOrigin, jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream, setUidCookie, SESSION_COOKIE_NAME } from '@/lib/cookie';

export const runtime = 'nodejs';

/**
 * Step 2 of passkey login. Forwards the assertion JSON plus the temp
 * session cookie set by /begin. On success new-api swaps it out for a
 * full auth session, which we rewrite same-origin and pair with the
 * `uid` companion cookie required by the BFF passthrough.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }

  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/api/user/passkey/login/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: `${SESSION_COOKIE_NAME}=${session}` } : {}),
    },
    body: JSON.stringify(body),
  });

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }

  const res = NextResponse.json(payload, { status: upstream.status });
  rewriteSessionFromUpstream(upstream.headers, res);
  const p = payload as { success?: boolean; data?: { id?: number } };
  if (p?.success && typeof p.data?.id === 'number') {
    setUidCookie(res, p.data.id);
  }
  return res;
}
