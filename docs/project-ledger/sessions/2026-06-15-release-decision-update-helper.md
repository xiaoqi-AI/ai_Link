# Release Decision Update Helper

Date: 2026-06-15

## Summary

Added a public-safe helper for updating the v0.1 release decision record after manual gates are actually confirmed or waived.

New command:

```powershell
npm run release:decisions:update
```

The command previews by default. It writes only when `--yes` is present.

## Behavior

- Targets `docs/releases/v0.1.0-decisions.json`.
- Supports status updates for `pending`, `approved`, `waived`, and `blocked`.
- Supports `selectedChannel` updates only for `npm-publish-decision`.
- Requires public-safe evidence before marking a decision `approved`.
- Requires a public-safe note before marking a decision `waived`.
- Rejects common secret-like inputs and does not echo rejected secret-like values.

## Safety Boundary

The helper does not read API keys, tokens, `.env` files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or `runtime/private`. It does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live providers.

## Follow-Up

After GitHub hardening, Bitwarden setup, provider-live cost approval, or release-channel choices are confirmed, use the updater to preview the public record change. Add `--yes` only after checking that the evidence is safe for the public repository.
