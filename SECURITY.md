# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Open Chat UI, please **do not** open a public issue. Instead, open a [private security advisory](https://github.com/ashburnsec/open-chat-ui/security/advisories/new) on GitHub.

We aim to acknowledge reports within 7 days.

## Scope

- ✅ XSS / CSRF / clickjacking in the UI
- ✅ Authentication / session handling flaws
- ✅ Prompt injection vectors that escalate to UI-level harm
- ✅ Dependency vulnerabilities (we ship `pnpm audit` as part of CI)

## Out of Scope

- Your specific backend (we don't ship one — bring your own)
- LLM hallucinations / model-level safety (please report to the model vendor)
- Mock-mode behavior (`NEXT_PUBLIC_USE_MOCK=true` is for development only — never deploy this to production)

## License Compliance

This project is licensed under **AGPL-3.0-or-later**. If you operate a modified version as a network service, you must offer your modifications to users under the same license. Failure to comply is itself a security and trust concern — please reach out if you need clarification before going to production.
