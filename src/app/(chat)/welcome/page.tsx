import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { newapi } from '@/lib/newapi';
import { ChatPanel } from '@/components/chat/ChatPanel';

/**
 * Chat home — empty welcome state + composer. The model list is fetched
 * server-side from `/api/user/models` (verified path; not the bogus
 * `/self/models` we initially tried). If the user is admin and no
 * channels exist yet, this returns an empty array — the picker handles
 * that with a "请先在 new-api 后台创建渠道" hint.
 *
 * In M4 this page becomes a "create new conversation" surface that
 * redirects to /c/[id] on first message; for M3 the conversation lives
 * only in the React tree.
 */
export default async function ChatHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);

  const status = await getStatus();
  const modelsRes = await newapi<string[]>('/api/user/models');
  const models = modelsRes.success && Array.isArray(modelsRes.data) ? modelsRes.data : [];

  // M41 A1: key="welcome" 让从 /c/[id] 回到 /welcome 时 ChatPanel 必 remount
  return <ChatPanel key="welcome" user={user} status={status} models={models} />;
}
