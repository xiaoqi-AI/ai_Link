# 2026-06-15 BWS Secret Mode Skill

## Summary

- Added `examples/codex-skills/bws-secret-mode/SKILL.md` as the project-local Codex runbook for the target phrase `进入 BWS 密钥托管模式`.
- Added `tools/check-codex-skills.js` and `npm run skills:check` to validate project skill examples.
- Added skill validation to `npm run verify:fresh`.
- Linked the BWS secret-mode skill from README, user guide, and Bitwarden architecture docs.

## Safety Boundary

- The skill contains only environment variable names, command flow, and safety rules.
- It does not include real secret values, token placeholders that resemble real credentials, login state, screenshots, or private paths.
- It instructs Codex to use hidden prompts or current-session variables for bootstrap tokens.

## Verification

- `npm run skills:check`
- `npm run bws:acceptance:print`
- `npm run security:scan`
- `npm run verify:fresh`

## Next Step

- If the skill should be globally discoverable by Codex outside this repository, copy or install it into the user's Codex skills directory after explicit user confirmation.
