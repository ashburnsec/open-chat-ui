# Open Chat UI

> Open-source AI chat interface built with **Next.js 15** + **Vercel design system**.
> Bring your own OpenAI-compatible backend, or run in **mock mode** for an instant UI demo.

[中文文档 →](./README.zh.md)

---

## Features

- 🎨 **Vercel design system** — single ink CTA, canvas-soft surfaces, mesh-gradient hero, 5-level stacked shadow ladder
- 🤖 **Multi-model chat** — works with any OpenAI-compatible API (Chat Completions + Responses)
- 📚 **Prompts library** — curated agent marketplace with search, tags, categories
- 🎬 **Mini-app workflows** — one-click image generation, storyboard, etc.
- 💾 **Conversation history** — persistent chats with branching, search, share, export
- 🎙️ **Voice & video** — TTS read-aloud + Veo-style video generation slots (bring your own provider)
- 🌍 **i18n** — `zh` + `en` out of the box, brand name is a single env var
- 🧪 **Mock mode** — fully functional UI without standing up any backend

## Quick Start (Mock Mode)

```bash
git clone https://github.com/ashburnsec/open-chat-ui.git
cd open-chat-ui
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001). The UI is fully browsable; chat messages return a canned mock response so you can iterate on UI without a backend.

## Connect a Real Backend

Edit `.env.local`:

```bash
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_BASE_URL=https://your-openai-compatible-host/v1
NEWAPI_INTERNAL_URL=https://your-openai-compatible-host
CONV_SERVICE_URL=http://localhost:4000   # or your conversation-service URL
```

Your backend needs to expose:

- **OpenAI-compatible** `/v1/chat/completions` + `/v1/responses` (SSE)
- **NewAPI-compatible** session cookies (or adapt `src/middleware.ts`)
- A **conversation-service** at `CONV_SERVICE_URL` for history/agents/wizards (or stub these in your own way)

The frontend forwards session cookies between the BFF (`src/app/api/*`) and your upstream — see `src/lib/conv.ts` + `src/lib/newapi.ts`.

## Custom Branding

Set `NEXT_PUBLIC_BRAND_NAME` (default `Open Chat`) — used in the auth wordmark, landing hero, and topnav.

```bash
NEXT_PUBLIC_BRAND_NAME=Acme Chat
```

## Stack

- **Framework** — Next.js 15 (App Router, RSC, Server Actions)
- **Styling** — Tailwind CSS v4 + custom Vercel-style token system (`src/app/globals.css`)
- **Components** — Radix UI primitives + shadcn-style wrappers (`src/components/ui/*`)
- **State** — Zustand + React Query
- **i18n** — next-intl with cookie-based locale switching
- **Fonts** — Inter (Latin) + Noto Sans SC (Chinese) + JetBrains Mono

## Project Structure

```
src/
├── app/                  # Next.js App Router (pages + API routes)
│   ├── (chat)/           # Authenticated chat surfaces (welcome, history, agents, ...)
│   ├── api/              # 36 BFF routes (proxied to your backend)
│   ├── auth/             # Sign-in / sign-up / reset
│   └── share/            # Public read-only conversation snapshots
├── components/           # ~95 React components organised by surface
│   ├── ui/               # Radix primitives (button, card, dialog, ...)
│   ├── chat/             # ChatPanel, ChatComposer, MessageList, ...
│   ├── agents/           # PromptsLibrary, MiniAppsPanel, ...
│   ├── workflow/         # Mini-app wizard steps
│   ├── landing/          # Public marketing page sections
│   └── ...
├── lib/                  # Pure utilities + server helpers
│   ├── newapi-client/    # OpenAI/NewAPI typed client
│   ├── brand.ts          # env-driven brand resolver
│   ├── conv.ts           # conversation-service server fetcher
│   ├── newapi.ts         # newapi server fetcher
│   └── ...
├── mocks/                # Mock backend (active when NEXT_PUBLIC_USE_MOCK=true)
└── middleware.ts         # Route protection + mock dispatch
```

## Design System

The project follows **[Vercel's DESIGN.md](./DESIGN.md)** ([source](https://github.com/voltagent/awesome-design-md)) — single ink black CTA on near-white canvas, multi-stop mesh gradient as the only decorative system, Geist/Inter typography with negative tracking.

## Contributing

Pull requests welcome! Please:

1. Run `pnpm typecheck && pnpm test` before pushing
2. Match the existing Vercel design language (see `DESIGN.md`)
3. Keep components in their surface folder (chat / agents / workflow / ...)

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

**AGPL-3.0-or-later** — see [LICENSE](./LICENSE).

If you fork this for a commercial offering, your modifications must also be open-sourced under AGPL-3.0. For licensing questions, open an issue.

---

Built with ❤️ and the Vercel design system.
