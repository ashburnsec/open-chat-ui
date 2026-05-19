/**
 * M43-Prompts-Library: `AgentsPanel` 组件已被 `PromptsLibrary` 取代,
 * 见 PromptsLibrary.tsx + AgentsPageClient.tsx.
 *
 * 仅保留此文件做 `Agent` 类型 re-export — 让 MiniAppsPanel / AgentForm
 * 等 import 路径无需改动. 未来删此文件时, 将 import 切到 PromptsLibrary.
 */
export type { Agent } from './PromptsLibrary';
