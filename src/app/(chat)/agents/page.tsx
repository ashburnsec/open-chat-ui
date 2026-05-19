import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AgentsPageClient } from '@/components/agents/AgentsPageClient';

export default async function AgentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <AgentsPageClient />
    </div>
  );
}
