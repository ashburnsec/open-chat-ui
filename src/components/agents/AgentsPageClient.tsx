'use client';

import { PromptsLibrary } from '@/components/agents/PromptsLibrary';

/**
 * M43-Prompts-Library: /agents 页面重构.
 *
 * 旧 (M37): AgentsPanel + InspirationPanel 上下排, 视觉不统一.
 * 新: 单一 PromptsLibrary 组件, 圆 avatar + tag chip + hover float +
 *   Tabs (所有/我的) + tag 云 + 排序. InspirationPanel 灵感场景预填
 *   功能并入 tag 云. mini-app 仍在 /mini-apps 单独入口不动.
 */
export function AgentsPageClient() {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
      <PromptsLibrary />
    </div>
  );
}
