# 2026-06-15 External Setup Preflight And Roadmap

## Summary

Added a public-safe go/no-go gate before real Bitwarden or GitHub UI setup, plus a roadmap report for the next execution phases.

## Changes

- Added `npm run external:preflight` and `npm run external:preflight:json`.
- Added `npm run roadmap:next` and `npm run roadmap:next:json`.
- Added CI, onboarding, fresh-clone, release-plan, release-readiness, and release-evidence wiring for both reports.
- Updated README, quickstart, user guide, and release process docs so maintainers can discover the new commands.
- Added tests covering JSON output, markdown output, and token-value redaction.

## Safety

- The preflight report does not read API keys, tokens, `.env` files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, screenshots, or `runtime/private`.
- The preflight blocks external setup evidence collection when the public repository is dirty or unsynced.
- The roadmap is planning-only and does not modify GitHub, Bitwarden, release records, tags, npm packages, provider-live workflows, or connector accounts.

## Next Steps

- After this change is committed and pushed, run `npm run external:preflight` again; it should move from dirty-tree hold to ready when local and remote are clean.
- Use `npm run github:hardening:next` for GitHub branch protection, required Verify, secret scanning, and push protection.
- Use `npm run bws:next` and `npm run bws:acceptance:json` for Bitwarden project and machine-account setup evidence.
- Use `npm run roadmap:next` whenever the next implementation phase needs a public-safe planning snapshot.
