import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { LandingPage } from '@/components/landing/LandingPage';

/**
 * Root URL `/` is now the marketing landing page (M19).
 *
 * Routing semantics:
 *   - Logged-in visitors → instant redirect to /welcome (the chat home,
 *     which lives under the `(chat)` layout group with sidebar shell).
 *   - Anonymous visitors → render LandingPage. The header CTAs open
 *     an in-page auth modal; on success the modal closes and a
 *     router.refresh() re-runs this server component → the redirect
 *     above fires and the user lands in /welcome.
 *
 * The chat shell intentionally does NOT wrap this route — the landing
 * page is full-bleed and standalone.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect('/welcome' as never);

  // Anonymous visitor — surface system status (system_name + features
  // toggles) so the page can use the brand name configured in
  // new-api admin instead of a hard-coded label.
  const status = await getStatus();
  return <LandingPage status={status} />;
}
