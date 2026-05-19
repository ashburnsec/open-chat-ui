/**
 * Client-safe developer-hub config: no `next/headers`, no server imports.
 * Anything here can be pulled into a 'use client' component without
 * tripping the build.
 *
 * The base URL is the externally-reachable OpenAI-compatible API host.
 * Driven by `NEXT_PUBLIC_API_BASE_URL` so each deployment plugs in its
 * own backend; defaults to a placeholder shown in the developer hub.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'https://your-deployment.example.com/v1';

export type ToolId = 'claudeCode' | 'codex' | 'cursor' | 'cherryStudio' | 'generic';

export type ConfigKind = 'env' | 'ui';

export interface ToolMeta {
  id: ToolId;
  /** Recommended default model — used in config blocks and curl tests. */
  defaultModel: string;
  /** env-vars (CLI tools) vs UI settings (GUI clients). */
  configKind: ConfigKind;
  /** Influences which test endpoint we curl and which header to use. */
  protocol: 'anthropic' | 'openai-responses' | 'openai-chat';
  /** Optional install instructions, joined with newlines for display. */
  installCommands?: string[];
  /** Config / setup instructions. `{{TOKEN}}` is replaced at render time. */
  configTemplate: string;
  /** Working curl command to verify connectivity. `{{TOKEN}}` is replaced. */
  testCommand: string;
}

const PLACEHOLDER = '<YOUR_API_KEY>';

export const TOOL_METAS: Record<ToolId, ToolMeta> = {
  claudeCode: {
    id: 'claudeCode',
    defaultModel: 'claude-4.5-sonnet',
    configKind: 'env',
    protocol: 'anthropic',
    installCommands: ['npm install -g @anthropic-ai/claude-code'],
    configTemplate: `export ANTHROPIC_BASE_URL="${API_BASE_URL}"
export ANTHROPIC_AUTH_TOKEN="{{TOKEN}}"
export ANTHROPIC_MODEL="claude-4.5-sonnet"`,
    testCommand: `curl ${API_BASE_URL}/messages \\
  -H "x-api-key: {{TOKEN}}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-4.5-sonnet","max_tokens":64,"messages":[{"role":"user","content":"ping"}]}'`,
  },
  codex: {
    id: 'codex',
    defaultModel: 'gpt-5.4',
    configKind: 'env',
    protocol: 'openai-responses',
    installCommands: ['npm install -g @openai/codex'],
    configTemplate: `export OPENAI_BASE_URL="${API_BASE_URL}"
export OPENAI_API_KEY="{{TOKEN}}"`,
    testCommand: `curl ${API_BASE_URL}/responses \\
  -H "Authorization: Bearer {{TOKEN}}" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.4","input":"ping"}'`,
  },
  cursor: {
    id: 'cursor',
    defaultModel: 'gpt-5.4',
    configKind: 'ui',
    protocol: 'openai-chat',
    configTemplate: `Cursor → Settings → Models
1) 启用 OpenAI / Enable OpenAI
2) Override OpenAI Base URL → ${API_BASE_URL}
3) OpenAI API Key → {{TOKEN}}
4) Model Name → gpt-5.4
5) 点 Verify`,
    testCommand: `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer {{TOKEN}}" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"ping"}]}'`,
  },
  cherryStudio: {
    id: 'cherryStudio',
    defaultModel: 'gpt-5.4',
    configKind: 'ui',
    protocol: 'openai-chat',
    configTemplate: `Cherry Studio → 服务商 / Providers → 添加 / Add → 类型「OpenAI」
名称 / Name → Open Chat
API Host → ${API_BASE_URL}
API Key → {{TOKEN}}
点「检查」/ Check → 添加模型 gpt-5.4`,
    testCommand: `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer {{TOKEN}}" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"hi"}]}'`,
  },
  generic: {
    id: 'generic',
    defaultModel: 'gpt-5.4',
    configKind: 'ui',
    protocol: 'openai-chat',
    configTemplate: `# OpenAI-compatible client (ChatBox / LobeChat / NextChat / Open WebUI / ...)
Provider type → OpenAI
Base URL → ${API_BASE_URL}
API Key → {{TOKEN}}
Model → gpt-5.4`,
    testCommand: `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer {{TOKEN}}" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"hi"}]}'`,
  },
};

export const TOOL_ORDER: readonly ToolId[] = [
  'claudeCode',
  'codex',
  'cursor',
  'cherryStudio',
  'generic',
];

/** Replace `{{TOKEN}}` in a template. When token is null, drop in a
 *  visible placeholder so the user can still see the shape of the
 *  config without leaking anything sensitive. */
export function renderTemplate(template: string, token: string | null) {
  return template.replaceAll('{{TOKEN}}', token ?? PLACEHOLDER);
}
