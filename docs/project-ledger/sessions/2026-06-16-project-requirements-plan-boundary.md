# 2026-06-16 Project Requirements Plan Boundary

## Summary

Added a current project contract for AI Link that follows the new iteration-boundary format: requirement, expected planning/work, verification, and boundary control. The document gives maintainers and Codex a single public-safe reference for project requirements, planning, next actions, project boundaries, manual gates, risks, and value.

## Change

- Added `docs/10-product/project-requirements-plan-boundary.md`.
- Linked it from README and `docs/user-guide.md`.
- Cross-linked it from `docs/10-product/project-plan-detailed.md`.
- Updated open questions to reflect that `iteration:boundary` now exists as the machine-readable boundary entry.
- Added the new contract document to release readiness checks.

## Boundary

This was a documentation and governance update only. It did not touch GitHub UI settings, Bitwarden resources, provider-live dispatch, npm publishing, SDK work, real connector implementation, platform login state, or `runtime/private`.

## Verification

Planned verification:

- `node --test tests/release-readiness.test.js`
- `npm run release:readiness:json`
- `npm run security:scan`
- `npm run external:preflight:json`
- knowledge mirror sync and verification
