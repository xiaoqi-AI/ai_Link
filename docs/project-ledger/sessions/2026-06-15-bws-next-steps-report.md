# BWS Next Steps Report

Date: 2026-06-15

## Summary

Added a read-only BWS next-step report for maintainers who need the current Bitwarden setup state and the next safe command before touching real credentials.

New commands:

```powershell
npm run bws:next
npm run bws:next:json
```

## Behavior

- Reads `.ai-link/bitwarden-secrets.manifest.json`.
- Reports whether the BWS manifest exists, whether the `bws` CLI is available, and whether session bootstrap variables are present.
- Splits remaining work into review, Bitwarden resource creation, local session loading, strict local verification, GitHub provider-live wiring, and provider-live cost approval.
- Feeds onboarding, next actions, setup handoff, release evidence, release readiness, CI, and fresh-clone verification.

## Safety Boundary

The command does not read API keys, tokens, `.env` files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or `runtime/private`. It reports bootstrap credentials only as present or missing and never prints values. It does not modify Bitwarden, GitHub settings, release records, tags, npm packages, or provider-live workflows.

## Follow-Up

Use `npm run bws:next` before entering BWS setup work. After the secret owner creates the real Bitwarden projects and machine accounts, load only session-scoped bootstrap values and run `npm run bws:acceptance:strict` before any live provider verification.
