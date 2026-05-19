import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ConversationHistoryList } from '@/components/conversations/ConversationHistoryList';

/**
 * M29-G: full conversation history page. The sidebar still shows the
 * 20 most recent for quick switching; this page is the canonical
 * "everything I ever talked about" list with search + filters +
 * richer per-row detail (model badge, last-message preview, time).
 */
export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <ConversationHistoryList />
    </div>
  );
}
