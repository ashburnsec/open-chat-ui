import { NextResponse } from 'next/server';
import { ensureSameOrigin, NEWAPI_INTERNAL_URL, jsonError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/reset-request?email=...
 *
 * Step 1 of new-api's password-reset flow: triggers an email with a
 * tokenised reset link to the user's address. The email body links back
 * to /auth/reset?email=&token=… on this origin, where step 2 runs.
 *
 * (We use a custom path instead of the generic newapi passthrough so we
 * can rate-limit / log resets independently in the future.)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  if (!email) return jsonError('email required');
  const upstream = await fetch(
    `${NEWAPI_INTERNAL_URL}/api/reset_password?email=${encodeURIComponent(email)}`,
  );
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }
  return NextResponse.json(payload, { status: upstream.status });
}

/**
 * POST /api/auth/reset-request  { email }
 *
 * Browser-friendly variant — same upstream, JSON body for forms with CSRF
 * protection (the GET version is intentionally rate-limited but lacks
 * Origin checks per new-api's design).
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }
  if (!body.email) return jsonError('email required');
  const upstream = await fetch(
    `${NEWAPI_INTERNAL_URL}/api/reset_password?email=${encodeURIComponent(body.email)}`,
  );
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }
  return NextResponse.json(payload, { status: upstream.status });
}
