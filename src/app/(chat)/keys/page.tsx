import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { DeveloperHub } from '@/components/developer/DeveloperHub';

/**
 * Developer hub on `/keys` — sidebar "API" entry. M22 turned this from
 * a single token CRUD panel into a 3-tab dashboard: tokens / setup
 * guide / model pricing. URL stays `/keys` for backwards compatibility.
 */
export default async function KeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const status = await getStatus();
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <DeveloperHub quotaPerUnit={status.quota_per_unit || 500000} />
    </div>
  );
}
