# 2026-06-15 BWS CLI Detection

## Summary

Aligned the Node-based `bws:next` report and PowerShell BWS helpers so they can detect an installed Bitwarden Secrets Manager CLI even when `bws` is not on PATH.

## Change

- `tools/show-bws-next.js` and BWS PowerShell helpers now check:
  - `AI_LINK_BWS_CLI_PATH`
  - `bws` on PATH
  - the Bitwarden Secrets Manager Windows default install path under `%LOCALAPPDATA%`
- `tests/bws-next.test.js` now covers explicit CLI path resolution outside PATH.
- `tests/bws-acceptance.test.js` now covers explicit CLI path resolution for the PowerShell acceptance report.
- BWS checks report the CLI version without printing the local executable path.
- README, user guide, and the Bitwarden architecture doc now mention the supported CLI detection paths.

## Current Local Evidence

- `npm run bws:next:json` reports `bws CLI` as `ready` with `bws 2.1.0`.
- `AI_LINK_BWS_PROJECT_ID`, `AI_LINK_BWS_CI_PROJECT_ID`, and `BWS_ACCESS_TOKEN` remain unset, so real Bitwarden resources still need manual setup.

## Safety

- No token, API key, Bitwarden secret value, GitHub secret, provider response, login state, screenshot, or `runtime/private` content is read or printed.
