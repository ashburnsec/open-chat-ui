/**
 * Server-side mock dispatcher. Mirrors `src/mocks/dispatch.ts` (which
 * handles HTTP `/api/*` via middleware), but answers programmatic calls
 * from Server Components / BFF helpers (`newapi()` in `lib/newapi.ts`,
 * `convFetch()` in `lib/conv.ts`).
 *
 * Returns the same `{success, message, data}` envelope the real
 * upstreams use so callers don't need to know they're mocked.
 */

import {
  MOCK_USER,
  MOCK_STATUS,
  MOCK_AGENTS,
  MOCK_CONVERSATIONS,
  MOCK_MESSAGES_BY_CONV,
  MOCK_MODELS,
  MOCK_MODEL_OVERRIDES,
} from './data';

type Envelope<T> = { success: boolean; message: string; data?: T };

function ok<T>(data: T): Envelope<T> {
  return { success: true, message: '', data };
}

/** Server-side mock for `newapi<T>(path, init)` calls. */
export async function mockNewapi<T = unknown>(path: string): Promise<Envelope<T>> {
  if (path === '/api/status') return ok(MOCK_STATUS as unknown as T);
  if (path === '/api/user/self') return ok(MOCK_USER as unknown as T);
  if (path === '/api/user/models') return ok(MOCK_MODELS as unknown as T);
  if (path === '/api/pricing') return ok({} as unknown as T);
  if (path.startsWith('/api/token')) return ok({ items: [] } as unknown as T);
  return ok(null as unknown as T);
}

/** Server-side mock for `convFetch<T>(path, init)` calls. */
export async function mockConvFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<Envelope<T>> {
  const method = (init.method ?? 'GET').toUpperCase();

  // Agents
  if (path.startsWith('/v1/agents')) {
    if (path === '/v1/agents' && method === 'GET') return ok({ items: MOCK_AGENTS } as unknown as T);
    if (path === '/v1/agents' && method === 'POST') return ok({ id: 999 } as unknown as T);
    if (path === '/v1/agents/popular') return ok({ items: MOCK_AGENTS.slice(0, 3) } as unknown as T);
    if (path === '/v1/agents/tags')
      return ok({
        items: [
          { tag: 'writing', count: 1 },
          { tag: 'coding', count: 1 },
        ],
      } as unknown as T);
    if (path.match(/^\/v1\/agents\/[^/]+\/use$/)) return ok({ ok: true } as unknown as T);
    if (path.match(/^\/v1\/agents\/[^/]+$/) && method === 'GET') {
      const slug = path.split('/').pop()!;
      const found = MOCK_AGENTS.find((a) => a.slug === slug);
      return found
        ? ok(found as unknown as T)
        : { success: false, message: 'not found' };
    }
    return ok(null as unknown as T);
  }

  // Conversations
  if (path.startsWith('/v1/conversations')) {
    if (path === '/v1/conversations' && method === 'GET')
      return ok({ items: MOCK_CONVERSATIONS } as unknown as T);
    if (path === '/v1/conversations' && method === 'POST')
      return ok({ id: `demo-conv-${Date.now()}` } as unknown as T);
    if (path === '/v1/conversations/search') return ok({ items: [] } as unknown as T);
    const m = path.match(/^\/v1\/conversations\/([^/]+)(\/.*)?$/);
    if (m) {
      const id = m[1];
      const sub = m[2] ?? '';
      if (sub === '' && method === 'GET') {
        const found = MOCK_CONVERSATIONS.find((c) => c.id === id) ?? MOCK_CONVERSATIONS[0];
        return ok(found as unknown as T);
      }
      if (sub === '/messages' && method === 'GET') {
        const messages = MOCK_MESSAGES_BY_CONV[id] ?? [];
        return ok({ items: messages } as unknown as T);
      }
      return ok({ ok: true } as unknown as T);
    }
    return ok(null as unknown as T);
  }

  // Models / overrides
  if (path === '/v1/models/overrides') return ok({ items: MOCK_MODEL_OVERRIDES } as unknown as T);
  if (path === '/v1/health') return ok({ status: 'ok' } as unknown as T);

  return ok(null as unknown as T);
}
