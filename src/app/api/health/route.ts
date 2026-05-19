import { NextResponse } from 'next/server';
import { NEWAPI_INTERNAL_URL } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONV_URL = process.env.CONV_SERVICE_URL ?? 'http://localhost:4000';

/**
 * GET /api/health
 *
 * Returns 200 when the webapp BFF, conv-svc, and new-api are all reachable.
 * Each dependency is probed with a tiny timeout so a stuck upstream doesn't
 * cascade into an unhealthy webapp.
 *
 * Used by:
 *   - docker-compose healthcheck (every 30s)
 *   - load balancer / k8s readiness probe in prod
 *   - on-call dashboards
 */
export async function GET() {
  const out: Record<string, { ok: boolean; ms: number; error?: string }> = {};
  const probes: Array<[string, string]> = [
    ['newapi', `${NEWAPI_INTERNAL_URL}/api/status`],
    ['conv-svc', `${CONV_URL}/v1/health`],
  ];
  await Promise.all(
    probes.map(async ([name, url]) => {
      const start = Date.now();
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(3_000),
        });
        out[name] = { ok: res.ok, ms: Date.now() - start };
      } catch (e) {
        out[name] = {
          ok: false,
          ms: Date.now() - start,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  const allOk = Object.values(out).every((p) => p.ok);
  return NextResponse.json(
    {
      ok: allOk,
      service: 'chat-portal-web',
      checks: out,
      // ISO timestamp helps when correlating across multiple replicas.
      ts: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
