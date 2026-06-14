# GitHub Hardening Next Steps

Date: 2026-06-15

## Summary

Added a read-only GitHub hardening next-step report:

```powershell
npm run github:hardening:next
npm run github:hardening:next:json
```

## Behavior

- Summarizes the local GitHub safety baseline and hardening worksheet.
- Shows GitHub UI links for branch protection / rulesets and secret scanning / push protection.
- Splits remaining work into local baseline review, main protection, secret scanning, and public-safe release decision recording.
- Prints preview and write commands for the two GitHub hardening release decisions.

## Safety Boundary

The report does not read API keys, tokens, `.env` files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or `runtime/private`. It does not call GitHub APIs by default and does not modify GitHub settings, release records, tags, npm packages, Bitwarden secrets, or provider-live workflows.

## Follow-Up

After the repository maintainer configures GitHub UI settings, rerun:

```powershell
npm run github:safety:json
npm run github:hardening:next
npm run release:decisions:next
```
