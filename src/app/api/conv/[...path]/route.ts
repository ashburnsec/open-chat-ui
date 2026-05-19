import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generic BFF passthrough for conv-svc endpoints that don't have a
 * fine-grained Next route. Used by M34 model-display admin & public
 * read paths:
 *
 *   GET  /api/conv/v1/models/overrides       → conv-svc /v1/models/overrides
 *   GET  /api/conv/v1/admin/models           → conv-svc /v1/admin/models
 *   PUT  /api/conv/v1/admin/models/:id       → conv-svc /v1/admin/models/:id
 *   POST /api/conv/v1/admin/models/bulk-...  → conv-svc /v1/admin/models/...
 *
 * convFetch already injects X-NewApi-Cookie / X-NewApi-Uid; conv-svc's
 * requireAdmin middleware reads role from the verified `/api/user/self`
 * response, so admin-gating is enforced server-side regardless of what
 * the BFF claims.
 *
 * NOTE: Streaming endpoints (SSE for /v1/conversations/.../messages)
 * MUST NOT use this passthrough — they need convStreamFetch and the
 * dedicated route at /api/chat. This generic helper JSON-parses the
 * upstream body, which would corrupt event-stream chunks.
 */

type Params = Promise<{ path: string[] }>;

function buildPath(parts: string[], req: Request): string {
  const url = new URL(req.url);
  const tail = parts.join('/');
  return `/${tail}${url.search}`;
}

export async function GET(req: Request, ctx: { params: Params }) {
  const { path } = await ctx.params;
  const r = await convFetch(buildPath(path, req));
  return NextResponse.json(r);
}

export async function POST(req: Request, ctx: { params: Params }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { path } = await ctx.params;
  const body = await req.text();
  const r = await convFetch(buildPath(path, req), { method: 'POST', body });
  return NextResponse.json(r);
}

export async function PUT(req: Request, ctx: { params: Params }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { path } = await ctx.params;
  const body = await req.text();
  const r = await convFetch(buildPath(path, req), { method: 'PUT', body });
  return NextResponse.json(r);
}

export async function DELETE(req: Request, ctx: { params: Params }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { path } = await ctx.params;
  const r = await convFetch(buildPath(path, req), { method: 'DELETE' });
  return NextResponse.json(r);
}
