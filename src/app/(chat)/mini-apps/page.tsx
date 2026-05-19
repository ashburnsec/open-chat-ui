import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { MiniAppsPanel } from '@/components/agents/MiniAppsPanel';

/**
 * M37 · /mini-apps 智能体页 — 列出所有 wizard / mini-app 类入口
 * (flow_type='workflow' 的 agents). 一键生图是当前唯一一个; 后续电
 * 商/海报/漫剧等通过新增 agent row 接入, 不需要再加路由.
 *
 * 跟 /agents (单 feed: 助手 + 灵感) 区分: /agents 是普通 chat agent +
 * 模型推荐 + 场景 prompt; /mini-apps 是有专属 UI 的"独立工坊".
 */
export default async function MiniAppsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <MiniAppsPanel />
    </div>
  );
}
