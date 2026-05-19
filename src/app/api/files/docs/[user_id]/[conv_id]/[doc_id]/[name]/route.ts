import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { UID_COOKIE_NAME } from '@/lib/cookie';
import { convStreamFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/files/docs/[user_id]/[conv_id]/[doc_id]/[name]
 *
 * Mirror of the images proxy. Two-layer auth: BFF rejects on uid
 * mismatch first, conv-svc rejects again on its own. Forwards the
 * raw bytes back to the browser with the upstream's Content-Disposition
 * so "save as" gets the original filename.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ user_id: string; conv_id: string; doc_id: string; name: string }> },
) {
  const { user_id, conv_id, doc_id, name } = await ctx.params;
  const store = await cookies();
  const cookieUid = store.get(UID_COOKIE_NAME)?.value;
  if (!cookieUid || cookieUid !== user_id) {
    return NextResponse.json({ success: false, message: 'forbidden' }, { status: 403 });
  }
  const upstream = await convStreamFetch(
    `/v1/files/docs/${encodeURIComponent(user_id)}/${encodeURIComponent(conv_id)}/${encodeURIComponent(doc_id)}/${encodeURIComponent(name)}`,
    { method: 'GET' },
  );
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition':
        upstream.headers.get('content-disposition') ??
        `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': upstream.headers.get('cache-control') ?? 'public, max-age=31536000, immutable',
    },
  });
}
