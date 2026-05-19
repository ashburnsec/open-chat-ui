/**
 * Server-only auth helpers. Use inside Server Components, Route Handlers,
 * and middleware. Do NOT import from client components.
 */
import { cache } from 'react';
import type { SelfUser } from '@/lib/newapi-client';
import { newapi } from './newapi';

/**
 * Fetch the current user. Cached per request via React's `cache()`, so
 * calling this in multiple Server Components per render only hits new-api once.
 *
 * Returns `null` when no session cookie is present OR the upstream rejects
 * the cookie (expired / revoked / signed with a rotated SESSION_SECRET).
 */
export const getCurrentUser = cache(async (): Promise<SelfUser | null> => {
  // Mock mode: always return a demo user so the UI is fully browsable.
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    const { MOCK_USER } = await import('@/mocks/data');
    return MOCK_USER as unknown as SelfUser;
  }
  const res = await newapi<SelfUser>('/api/user/self');
  if (!res.success || !res.data) return null;
  return res.data;
});

/**
 * Convenience guard for RSC pages — call at the top, get a guaranteed user
 * back. Pages that use this should be wrapped in a layout that ensures the
 * route is in a protected group; the middleware handles the redirect, but
 * we still narrow the type here.
 */
export async function requireUser(): Promise<SelfUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('not authenticated');
  }
  return user;
}
