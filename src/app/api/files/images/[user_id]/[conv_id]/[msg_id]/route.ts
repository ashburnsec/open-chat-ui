import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { UID_COOKIE_NAME } from '@/lib/cookie';
import { convStreamFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/files/images/[user_id]/[conv_id]/[msg_id]
 *
 * Proxies to conv-svc /v1/files/images/...  with the standard auth headers.
 *
 * We pre-check uid here so the BFF returns 403 fast without a hop, and
 * conv-svc enforces the same rule again in defense-in-depth. Both return
 * 403 (not 404) on mismatch so an attacker can't probe for which images
 * exist.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ user_id: string; conv_id: string; msg_id: string }> },
) {
  const { user_id, conv_id, msg_id } = await ctx.params;
  const store = await cookies();
  const cookieUid = store.get(UID_COOKIE_NAME)?.value;
  if (!cookieUid || cookieUid !== user_id) {
    return NextResponse.json({ success: false, message: 'forbidden' }, { status: 403 });
  }

  const upstream = await convStreamFetch(
    `/v1/files/images/${encodeURIComponent(user_id)}/${encodeURIComponent(conv_id)}/${encodeURIComponent(msg_id)}`,
    { method: 'GET' },
  );

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control':
        upstream.headers.get('cache-control') ?? 'public, max-age=31536000, immutable',
    },
  });
}
