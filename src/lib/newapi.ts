/**
 * Server-side helper for forwarding the user's session cookie to new-api.
 * Use only inside route handlers and Server Components — `cookies()` is
 * Next.js server-only API.
 */
import { cookies } from 'next/headers';
import { newapiFetch, type RequestInitWithCookie } from '@/lib/newapi-client';
import { SESSION_COOKIE_NAME, UID_COOKIE_NAME } from './cookie';

export async function newapi<T = unknown>(
  path: string,
  init: Omit<RequestInitWithCookie, 'cookie'> = {},
) {
  // Mock mode: short-circuit to local fixtures (no real upstream).
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    const { mockNewapi } = await import('@/mocks/server');
    return mockNewapi<T>(path);
  }
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const uid = cookieStore.get(UID_COOKIE_NAME)?.value;
  // Server Components / route handlers must opt out of Next's data cache
  // for upstream calls — quota and session state change every request.
  return newapiFetch<T>(path, {
    ...init,
    cookie: session ? `${SESSION_COOKIE_NAME}=${session}` : undefined,
    headers: {
      ...(init.headers ?? {}),
      ...(uid ? { 'New-Api-User': uid } : {}),
    },
    cache: 'no-store',
  } as RequestInitWithCookie & { cache: RequestCache });
}

/**
 * Read the session and uid cookies once, returning the headers needed
 * to authenticate to upstream new-api. Useful when proxying SSE streams
 * where you can't simply hand off `init`.
 */
export async function getUpstreamAuthHeaders(): Promise<Record<string, string>> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const uid = store.get(UID_COOKIE_NAME)?.value;
  const out: Record<string, string> = {};
  if (session) out['Cookie'] = `${SESSION_COOKIE_NAME}=${session}`;
  if (uid) out['New-Api-User'] = uid;
  return out;
}
