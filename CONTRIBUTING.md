# Contributing to Open Chat UI

Thanks for your interest! This project welcomes UI improvements, bug fixes, accessibility work, and i18n contributions.

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The project runs in **mock mode** by default — no backend needed. You can iterate on every page, component, and interaction.

## Before You Push

```bash
pnpm typecheck   # tsc --noEmit, must be green
pnpm test        # vitest, must be green
pnpm build       # production build must succeed
```

## Design Language

This project follows the **Vercel design system** (see [`DESIGN.md`](./DESIGN.md)). When adding or modifying UI:

- **Single ink CTA** — primary actions use `bg-primary` (ink black), never a colored accent
- **Canvas surfaces** — `bg-canvas` (white cards) on `bg-canvas-soft` (page background)
- **Radius scale** — `rounded-sm` (6px) for in-app controls, `rounded-pill` (100px) for marketing CTAs, `rounded-md` (8px) for cards
- **Stacked shadows** — use `--shadow-2` … `--shadow-5`, never single heavy drop-shadows
- **No new accent colors** — the only non-neutral colors are `link` blue and the hero mesh gradient

## Code Conventions

- Components live in their surface folder: `chat/` `agents/` `workflow/` `landing/` `ui/` `shell/`
- i18n strings go in `messages/{zh,en}.json` — update **both** in the same change
- Keep comments explaining **why**, not **what**
- Match the existing TypeScript strictness (no `any` escapes)

## Commit Messages

Use conventional-ish prefixes: `feat:` `fix:` `docs:` `refactor:` `chore:`.

## Pull Requests

1. Open an issue first for non-trivial changes to discuss the approach
2. Keep PRs focused — one concern per PR
3. Include before/after screenshots for visual changes

## License

By contributing, you agree your contributions are licensed under **AGPL-3.0-or-later**.
