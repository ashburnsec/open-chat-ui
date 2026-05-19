import { NextResponse } from 'next/server';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** M43-Prompts-Library · BFF passthrough for /v1/agents/tags (tag cloud). */
export async function GET() {
  const r = await convFetch('/v1/agents/tags');
  return NextResponse.json(r);
}
