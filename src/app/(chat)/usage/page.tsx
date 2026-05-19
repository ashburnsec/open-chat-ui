import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { UsagePanel } from '@/components/billing/UsagePanel';

export default async function UsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const status = await getStatus();
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <UsagePanel quotaPerUnit={status.quota_per_unit || 500000} />
    </div>
  );
}
