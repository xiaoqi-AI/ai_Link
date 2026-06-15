# Maintainer Action Pack

Date: 2026-06-15

## Summary

Added a read-only maintainer action pack:

```powershell
npm run maintainer:pack
npm run maintainer:pack:json
```

## Behavior

- Combines the existing next-action, setup handoff, BWS next-step, GitHub hardening next-step, release decision next-command, and release readiness reports.
- Gives maintainers one ordered handoff for GitHub UI hardening, Bitwarden setup, provider-live GitHub wiring, release decision closeout, provider-live cost approval, and release-channel choice.
- Includes UI links, preview commands, after-review write commands, evidence expectations, stop-before warnings, and secret boundaries.

## Safety Boundary

The action pack does not read API keys, tokens, `.env` files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, screenshots, or `runtime/private`. It does not modify GitHub settings, release records, tags, npm packages, Bitwarden secrets, GitHub secrets, or provider-live workflows.

## Follow-Up

After maintainers finish external setup, rerun:

```powershell
npm run maintainer:pack
npm run release:decisions:next
npm run release:decisions:strict
```
