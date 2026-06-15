# 2026-06-15 BWS Recommended Next

## Summary

Added a machine-readable `recommendedNext` field to the `bws:next` report so Codex, maintainers, and CI-style handoff tools can identify the next safe BWS setup action without reading secrets or guessing from the full phase table.

## Change

- `tools/show-bws-next.js` now derives one recommended next action from the current public-safe session state.
- `tests/bws-next.test.js` covers the default setup path, project-id-only path, token-present path, GitHub-token-present path, Markdown rendering, and missing-manifest recovery path.
- README, user guide, and the Bitwarden architecture doc now explain `recommendedNext`.

## Safety

- `recommendedNext` includes command names, owners, evidence, stop-before notes, and secret boundaries only.
- It does not print project ID values, BWS tokens, GitHub tokens, provider API keys, Bitwarden secret values, raw provider responses, screenshots, login state, or `runtime/private` content.
