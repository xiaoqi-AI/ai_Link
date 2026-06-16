# BWS Runtime Worksheet And npm.cmd Fallback

Date: 2026-06-16

## Summary

Generated the current local BWS handoff artifacts under `runtime/tmp` and documented the Windows PowerShell `npm.cmd` fallback.

## Runtime Artifacts

- `runtime/tmp/bws-setup-worksheet.md`
- `runtime/tmp/bws-onboarding.md`
- `runtime/tmp/bws-rotation-plan.md`

These files are local runtime artifacts and must not be committed. They contain only environment variable names, project names, machine-account names, command names, and placeholders.

## Current Acceptance State

`npm.cmd run bws:acceptance:json` reports:

- pass: 20
- pending: 7
- fail: 0
- skip: 1

Pending items are external setup only: `AI_LINK_BWS_PROJECT_ID`, `AI_LINK_BWS_CI_PROJECT_ID`, session-only `BWS_ACCESS_TOKEN`, optional GitHub API token, GitHub provider-live Environment checks, BWS GitHub provider-live variable IDs, and provider-live cost approval.

## Safety Boundary

No secret values, access tokens, provider responses, screenshots, browser state, `.env` files, or `runtime/private` data were written to Git or docs. PowerShell command examples may use `npm.cmd` when local execution policy blocks `npm.ps1`.
