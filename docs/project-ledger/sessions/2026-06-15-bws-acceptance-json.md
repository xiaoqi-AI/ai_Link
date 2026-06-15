# 2026-06-15 BWS Acceptance JSON

## Summary

Added a machine-readable BWS acceptance report for Codex, CI, and maintainer handoff.

## Changes

- Added `npm run bws:acceptance:json`.
- Added `npm run bws:acceptance:strict:json`.
- Extended `tools/new-bws-acceptance-report.ps1` with `-Json`.
- Included the JSON entry in onboarding, fresh-clone verification, release readiness, release plan, setup handoff, BWS next steps, BWS setup plan, worksheet, rotation plan, and BWS secret-mode skill docs.

## Safety

- JSON output reports pass/warn/fail/pending/skip counts and public-safe details only.
- Token and secret values remain reported only as present or missing.
- Provider-live verification still requires explicit cost approval and is skipped by default.

## Follow-Up

- After Bitwarden projects, machine accounts, and GitHub provider-live Environment are configured, run `npm run bws:acceptance:strict:json`.
- Keep `BWS_ACCESS_TOKEN`, `BW_ACCESS_TOKEN`, `GH_TOKEN`, and `GITHUB_TOKEN` only in the current session or GitHub Environment Secret storage.
