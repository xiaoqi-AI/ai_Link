# 2026-06-30 Manual Gate Prioritization

## Summary

Continued v0.1 readiness work by prioritizing manual-assistance gates instead of expanding code, provider-live, Auth Hub deployment, or real connectors.

## Current Evidence

- Public repository `xiaoqi-AI/ai_Link` is accessible through authenticated `gh`.
- Public repository secret scanning is enabled.
- Public repository push protection is enabled.
- Public `main` branch protection is not configured yet.
- Internal companion repository `xiaoqi-AI/ai_Link-internal` is accessible and private.
- Internal companion repository secret scanning and push protection still need GitHub UI confirmation.
- BWS CLI is not available in the current session.
- Release decisions remain pending until the maintainer records public-safe evidence.

## Decisions Prepared

- Recommended next manual action: configure public `main` protection with required `Verify`.
- Recommended release channel for v0.1: `repository-local`.
- Recommended provider-live posture for repository-local v0.1: waive live verification and make no live-provider claim.
- Recommended BWS sequence: local-dev first, CI provider-live later.
- Recommended Auth Hub posture: keep remote mock dry-run as a separate future iteration.

## Files Added

- `docs/00-governance/manual-confirmation-playbook.md`

## Safety Boundary

No secrets, tokens, screenshots, QR codes, provider responses, login state, or `runtime/private/` content were read or recorded.
