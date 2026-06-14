# 2026-06-15 GitHub Safety REST Fallback

## Summary

Added a public-safe GitHub REST API fallback for `github:safety`, so remote repository safety settings can be verified on machines that do not have the GitHub CLI installed.

## Changes

- `tools/check-github-repo-safety.js` now keeps the existing authenticated `gh` path and falls back to GitHub REST API when `GH_TOKEN` or `GITHUB_TOKEN` is present.
- The fallback verifies repository visibility, default branch, branch protection, required `Verify`, secret scanning, and push protection when the API exposes those fields.
- Added a mock GitHub API test that proves the fallback sends the token only in the Authorization header and does not print it.
- Updated next-action, setup handoff, manual gate, hardening worksheet, release readiness, README, user guide, governance docs, open questions, and v0.1 notes to describe the new verification path.

## Safety Boundary

The fallback is read-only. It does not modify GitHub settings, create tags, publish packages, dispatch providers, read provider keys, read Bitwarden values, or write credentials to disk. `GH_TOKEN` and `GITHUB_TOKEN` are treated as session-only bootstrap credentials and must not be written into project files, docs, issues, PRs, screenshots, the knowledge mirror, or chat.

## Remaining Manual Work

- Configure branch protection or an equivalent ruleset for `main`.
- Require the `Verify` status check after GitHub Actions has a stable green run.
- Enable secret scanning and push protection in the public repo and review the same settings for the internal companion repo.
- Re-run `npm run github:safety:json` from an authenticated maintainer environment and record only public-safe evidence in the release decision record.
