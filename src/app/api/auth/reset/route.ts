import { NextResponse } from 'next/server';
import { ensureSameOrigin, NEWAPI_INTERNAL_URL, jsonError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/reset  { email, token }
 *
 * Step 2: confirm the reset token from the email. new-api generates a
 * fresh random 12-char password and returns it in `data` — the client
 * shows it once and prompts the user to log in.
 *
 * This is intentionally NOT a "set your own new password" endpoint;
 * that's `/api/user/self` PUT which requires being logged in. After the
 * user logs in with the auto-generated password they can change it via
 * /settings to something memorable.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  let body: { email?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }
  if (!body.email || !body.token) return jsonError('email and token required');

  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/api/user/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, token: body.token }),
  });
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }
  return NextResponse.json(payload, { status: upstream.status });
}
