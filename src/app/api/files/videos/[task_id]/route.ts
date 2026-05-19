import { NextResponse } from 'next/server';
import { convStreamFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/files/videos/[task_id]
 *
 * Streams the MP4 produced by a completed Veo task. We do NOT host the
 * file ourselves (V1 limitation — see plan): conv-svc proxies straight
 * to new-api `/v1/videos/{id}/content`, with the user's Bearer token
 * supplied internally so this route never touches the token store.
 *
 * Range header is forwarded both directions so <video controls> can
 * request byte ranges for seek-without-redownload.
 *
 * Auth: convStreamFetch attaches the session cookie + uid header, and
 * conv-svc's requireUser middleware enforces them — no per-task uid
 * check needed because new-api gates content access on the same Bearer
 * token that submitted the task.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ task_id: string }> },
) {
  const { task_id } = await ctx.params;
  const init: RequestInit = { method: 'GET' };
  const range = req.headers.get('range');
  if (range) init.headers = { Range: range };

  const upstream = await convStreamFetch(
    `/v1/videos/${encodeURIComponent(task_id)}/content`,
    init,
  );

  const headers: Record<string, string> = {
    'content-type': upstream.headers.get('content-type') ?? 'video/mp4',
  };
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) headers[h] = v;
  }
  headers['cache-control'] = upstream.ok ? 'private, max-age=3600' : 'no-store';

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
