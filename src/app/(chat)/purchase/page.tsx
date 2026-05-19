import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { PurchasePanel } from '@/components/billing/PurchasePanel';

export default async function PurchasePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const status = await getStatus();
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <PurchasePanel quotaPerUnit={status.quota_per_unit || 500000} />
    </div>
  );
}
