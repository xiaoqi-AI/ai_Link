# GitHub Hardening Worksheet

Date: 2026-06-15

## Summary

Added a public-safe GitHub hardening worksheet for the v0.1 manual release gate.

New commands:

```powershell
npm run github:hardening
npm run github:hardening:json
```

The worksheet covers:

- `main` branch protection or ruleset.
- Required `Verify` status check.
- Secret scanning and push protection for `xiaoqi-AI/ai_Link`.
- Secret scanning and push protection for `xiaoqi-AI/ai_Link-internal`.
- Post-configuration verification with `github:safety`, `release:readiness`, and `security:scan`.

## Safety Boundary

The worksheet does not read API keys, tokens, `.env`, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or `runtime/private`. It does not modify GitHub settings. Default file output is restricted to `runtime/tmp/`.

## Follow-Up

After a repository maintainer configures GitHub UI settings, rerun:

```powershell
npm run github:safety:json
npm run release:readiness:json
npm run release:evidence:json
```

Remaining external decisions are still manual: Bitwarden real project setup, provider-live Environment, provider-live cost approval, and v0.1 release channel.
