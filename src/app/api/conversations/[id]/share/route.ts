import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShareData = { token: string };

/**
 * POST /api/conversations/:id/share — mint a share link.
 * DELETE /api/conversations/:id/share — revoke it.
 *
 * Both routes are CSRF-gated (same-origin only). On POST we wrap the
 * upstream `{ token }` payload with a fully-qualified `url` built from
 * the request origin, so the modal can copy a complete link without
 * having to know its own host.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const r = await convFetch<ShareData>(
    `/v1/conversations/${encodeURIComponent(id)}/share`,
    { method: 'POST' },
  );
  if (!r.success || !r.data?.token) {
    return NextResponse.json(r);
  }
  // Prefer the Caddy-injected forwarded host so the share URL points at
  // the public domain (your-deployment-url), not the internal container
  // bind (0.0.0.0:3001 / web:3001). Env override
  // NEXT_PUBLIC_APP_ORIGIN is the last-resort fallback.
  const fwdHost = req.headers.get('x-forwarded-host');
  const fwdProto = req.headers.get('x-forwarded-proto');
  const envOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.PUBLIC_APP_ORIGIN;
  const origin =
    fwdHost && fwdProto
      ? `${fwdProto}://${fwdHost}`
      : envOrigin || new URL(req.url).origin;
  return NextResponse.json({
    ...r,
    data: {
      token: r.data.token,
      url: `${origin}/share/${r.data.token}`,
    },
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const r = await convFetch(
    `/v1/conversations/${encodeURIComponent(id)}/share`,
    { method: 'DELETE' },
  );
  return NextResponse.json(r);
}
