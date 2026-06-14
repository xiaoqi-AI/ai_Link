# BWS Run Wrapper

Date: 2026-06-15

## Summary

Promoted `tools/with-bitwarden-secrets.ps1` into first-class npm commands:

```powershell
npm run bws:run
npm run bws:run:help
```

## Behavior

- Wraps approved AI Link commands with Bitwarden Secrets Manager `bws run`.
- Defaults to `npm run ai-link -- doctor`.
- Supports custom commands with `npm run bws:run -- -CommandLine "<command>"`.
- Requires `AI_LINK_BWS_PROJECT_ID` and session-scoped `BWS_ACCESS_TOKEN`.
- Keeps `npm run bws:session` as the hidden-prompt path when the token is not already in the current session.

## Safety Boundary

The wrapper does not write token values to disk and does not print `BWS_ACCESS_TOKEN` or the Bitwarden project id value. It does not create Bitwarden resources, modify GitHub settings, publish npm packages, create tags, or dispatch provider-live workflows.

## Follow-Up

After the real Bitwarden resources are created, run:

```powershell
npm run bws:session
npm run bws:run -- -CommandLine "npm run ai-link -- doctor"
npm run bws:acceptance:strict
```
