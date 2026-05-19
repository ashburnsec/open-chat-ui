import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AgentForm } from '@/components/agents/AgentForm';

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const { slug } = await params;
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <AgentForm initialSlug={slug} />
    </div>
  );
}
