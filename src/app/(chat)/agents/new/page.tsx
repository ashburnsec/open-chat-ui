import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AgentForm } from '@/components/agents/AgentForm';

export default async function NewAgentPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <AgentForm />
    </div>
  );
}
