# Release Decision Next Commands

Date: 2026-06-15

## Summary

Added a read-only command report that turns pending v0.1 release decisions into public-safe preview and write commands.

New commands:

```powershell
npm run release:decisions:next
npm run release:decisions:next:json
```

## Behavior

- Reads `docs/releases/v0.1.0-decisions.json`.
- Lists the current status, owner, selected channel, and evidence count for each decision.
- Generates preview and write commands for each supported decision path.
- Keeps the current low-risk recommendation as `repository-local` until GitHub hardening, Bitwarden, provider-live credentials, and cost approval are confirmed.
- Does not write the decision record; writing still goes through `release:decisions:update` and requires `--yes`.

## Safety Boundary

The command does not read API keys, tokens, `.env` files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or `runtime/private`. It does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live providers.

## Follow-Up

After a maintainer completes a manual gate, run `npm run release:decisions:next`, choose the appropriate preview command, inspect it, then add `--yes` only after confirming the evidence is public-safe.
