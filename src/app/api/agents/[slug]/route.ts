import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const r = await convFetch(`/v1/agents/${encodeURIComponent(slug)}`);
  return NextResponse.json(r);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { slug } = await ctx.params;
  const body = await req.text();
  const r = await convFetch(`/v1/agents/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body,
  });
  return NextResponse.json(r);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { slug } = await ctx.params;
  const r = await convFetch(`/v1/agents/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
  return NextResponse.json(r);
}
