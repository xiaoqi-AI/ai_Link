# 2026-06-15 Release Evidence Bundle

## Summary

- Added `tools/new-release-evidence.js`.
- Added scripts:
  - `npm run release:evidence`
  - `npm run release:evidence:json`
- The evidence bundle combines onboarding, package contents, package install smoke, GitHub safety, release plan, manual gates, release readiness, and security scan results.
- Default output is `runtime/tmp/release-evidence.json`; JSON mode prints to stdout for CI or other agents.
- The existing next-action report is now part of the public maintenance flow alongside release evidence.

## Safety

- The evidence command does not read API keys, tokens, `.env`, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or `runtime/private`.
- It does not modify GitHub settings, create tags, publish npm packages, or dispatch live providers.
- Generated evidence stays in `runtime/tmp` and should not be committed.

## Follow-Up

- Before accepting v0.1 manual gates, run `npm run release:manual-gates` and `npm run release:evidence`.
- After external GitHub / Bitwarden settings are configured, rerun the same evidence command to capture the updated proof bundle.
