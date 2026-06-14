# Release Decisions Record

Date: 2026-06-15

## Summary

Added a public-safe v0.1 release decision record and checker.

New files and commands:

```powershell
docs/releases/v0.1.0-decisions.json
npm run release:decisions
npm run release:decisions:json
npm run release:decisions:strict
```

The decision record tracks:

- GitHub branch protection.
- GitHub secret scanning and push protection.
- v0.1 release channel / npm publish decision.
- Provider-live credentials and cost approval.

## Safety Boundary

The record may contain only owner roles, decision status, public-safe evidence references, and release intent. It must not include API keys, tokens, Bitwarden values, `.env` contents, provider responses, screenshots, QR codes, login state, or `runtime/private` paths.

## Current State

All four decisions are intentionally `pending`. `release:decisions` and `release:decisions:json` pass as a safe progress report. `release:decisions:strict` is expected to fail until the release owner closes or waives the pending decisions.
