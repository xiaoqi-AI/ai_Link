# 2026-06-15 Public Quickstart And Release Gates

## Summary

- Added `docs/quickstart.md` as the shortest public no-key path for trying AI Link.
- Connected the quickstart to README, user guide, release notes, onboarding checks, package contents checks, release plan, and release readiness.
- Promoted `tools/show-release-manual-gates.js` into the release flow with `release:manual-gates` and `release:manual-gates:json`.
- Added manual gate coverage to CI, fresh clone verification, release plan, release readiness, and tests.

## Safety

- The quickstart stays dry-run first and does not require provider API keys.
- `release:manual-gates` is read-only and does not modify GitHub settings, create tags, publish npm packages, read secrets, or dispatch live providers.
- Manual gates remain explicit for branch protection, secret scanning / push protection, npm publish decision, and provider-live credentials / cost approval.

## Verification

- Targeted checks covered onboarding, release plan, release readiness, and manual gate JSON output.
- Full closeout checks should still run before pushing the final commit.
