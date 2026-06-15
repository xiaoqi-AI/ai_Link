# 2026-06-15 BWS CLI Detection

## Summary

Aligned the Node-based `bws:next` report with the PowerShell BWS acceptance checks so it can detect an installed Bitwarden Secrets Manager CLI even when `bws` is not on PATH.

## Change

- `tools/show-bws-next.js` and BWS PowerShell helpers now check:
  - `bws` on PATH
  - `AI_LINK_BWS_CLI_PATH`
  - the Bitwarden Secrets Manager Windows default install path under `%LOCALAPPDATA%`
- `tests/bws-next.test.js` now covers explicit CLI path resolution outside PATH.
- BWS checks report the CLI version without printing the local executable path.
- README and user guide now mention the supported CLI detection paths.

## Current Local Evidence

- `npm run bws:next:json` reports `bws CLI` as `ready` with `bws 2.1.0`.
- `AI_LINK_BWS_PROJECT_ID`, `AI_LINK_BWS_CI_PROJECT_ID`, and `BWS_ACCESS_TOKEN` remain unset, so real Bitwarden resources still need manual setup.

## Safety

- No token, API key, Bitwarden secret value, GitHub secret, provider response, login state, screenshot, or `runtime/private` content is read or printed.
