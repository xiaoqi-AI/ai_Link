# 2026-06-15 Setup Handoff

## Summary

Added a public-safe ordered setup handoff for the remaining Bitwarden, GitHub, provider-live, and v0.1 release work.

## Changes

- Added `tools/show-setup-handoff.js`.
- Added npm scripts:
  - `npm run setup:handoff`
  - `npm run setup:handoff:json`
- Added `tests/setup-handoff.test.js`.
- Wired the setup handoff into CI, fresh clone verification, release evidence, and release readiness checks.
- Linked the command from README, quickstart, user guide, changelog, release notes, and release process docs.
- Carried forward the public-safe `release:decisions:update` helper in the same verification path, so release owners can preview decision-record updates before writing with `--yes`.

## Safety Boundary

The setup handoff is read-only. It does not read API keys, tokens, `.env`, GitHub secrets, Bitwarden secret values, provider responses, login state, browser state, or `runtime/private`. It does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live provider calls.

## Remaining Manual Work

- Create real Bitwarden Secrets Manager projects, machine accounts, and secret values.
- Configure GitHub `provider-live` Environment with `BW_ACCESS_TOKEN` as the bootstrap secret and Bitwarden secret IDs as variables.
- Enable GitHub branch protection, required `Verify`, secret scanning, and push protection.
- Close or waive `docs/releases/v0.1.0-decisions.json` release decisions with public-safe evidence.
- Approve provider-live cost boundaries before any live model verification.
- Decide whether v0.1 stays repository-local, becomes a GitHub Release, or publishes to npm.
