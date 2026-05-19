# Open Chat UI

> 基于 **Next.js 15** + **Vercel 设计系统** 的开源 AI 聊天界面。
> 接入任意 OpenAI 兼容后端，或用 **mock 模式** 立即预览全套 UI。

[English →](./README.md)

---

## 特性

- 🎨 **Vercel 设计系统** — 单一 ink 黑 CTA、canvas-soft 浅底、mesh 渐变 hero、5 级 stacked 阴影
- 🤖 **多模型聊天** — 兼容任意 OpenAI 协议后端（Chat Completions + Responses）
- 📚 **Prompts 库** — 角色市场，支持搜索 / 标签 / 分类
- 🎬 **Mini-app 工作流** — 一键生图、短片分镜等
- 💾 **会话历史** — 持久化对话 + 分支 / 搜索 / 分享 / 导出
- 🎙️ **语音 & 视频** — TTS 朗读 + 视频生成接口位（自带 provider）
- 🌍 **国际化** — 内置 `zh` + `en`，品牌名是单个环境变量
- 🧪 **Mock 模式** — 无需后端即可完整体验 UI

## 快速开始（Mock 模式）

```bash
git clone https://github.com/ashburnsec/open-chat-ui.git
cd open-chat-ui
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 [http://localhost:3001](http://localhost:3001)。UI 全功能可浏览；聊天会返回预制 mock 回复，方便在没有后端的情况下迭代界面。

## 接入真实后端

编辑 `.env.local`：

```bash
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_BASE_URL=https://你的-openai-兼容-host/v1
NEWAPI_INTERNAL_URL=https://你的-openai-兼容-host
CONV_SERVICE_URL=http://localhost:4000
```

后端需要提供：

- **OpenAI 兼容** `/v1/chat/completions` + `/v1/responses`（SSE）
- **NewAPI 兼容** 的 session cookie（或自行改 `src/middleware.ts`）
- `CONV_SERVICE_URL` 上的 **conversation-service**（管理历史 / 角色 / 工作流）

## 自定义品牌

设 `NEXT_PUBLIC_BRAND_NAME`（默认 `Open Chat`）：

```bash
NEXT_PUBLIC_BRAND_NAME=你的品牌
```

## 技术栈

Next.js 15 / Tailwind CSS v4 / Radix UI / Zustand / React Query / next-intl / Inter + Noto Sans SC + JetBrains Mono

## 设计系统

项目遵循 **[Vercel DESIGN.md](./DESIGN.md)** — 单一 ink 黑 CTA、近白 canvas 底、多 stop mesh 渐变作唯一装饰、几何 sans 字体 + 负字距。

## 许可证

**AGPL-3.0-or-later** — 见 [LICENSE](./LICENSE)。

商业 fork 必须同样以 AGPL-3.0 开源你的修改。许可问题请提 issue。

---

用 ❤️ 和 Vercel 设计系统构建。
