import { NextResponse } from 'next/server';
import { convStreamFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/videos/[task_id]
 *
 * Polled by the client every ~15 s while a Veo task is queued / running.
 * Returns whatever new-api's /v1/videos/{id} status endpoint emits
 * (`{ status, progress, ... }`). conv-svc inserts the user's Bearer
 * token between us and new-api so we don't need it here.
 *
 * Same-origin only — no CSRF check needed for GET, and there's no risk
 * of side effects (status read).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ task_id: string }> },
) {
  const { task_id } = await ctx.params;
  const upstream = await convStreamFetch(
    `/v1/videos/${encodeURIComponent(task_id)}`,
    { method: 'GET' },
  );
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
