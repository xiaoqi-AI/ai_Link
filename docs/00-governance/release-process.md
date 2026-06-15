# Release Process

AI Link v0.1 release work is intentionally split into local checks, manual GitHub UI checks, and explicit publish actions. Local checks never publish to npm, create tags, or call live providers.

## Local Release Gate

Run this sequence before creating a release tag or publishing any package:

```powershell
npm run check
npm test
npm run package:check
npm run package:install-smoke
npm run next:actions
npm run setup:handoff
npm run maintainer:pack
npm run external:preflight
npm run roadmap:next
npm run bws:next
npm run bws:run:help
npm run bws:acceptance:json
npm run github:safety
npm run github:hardening
npm run github:hardening:next
npm run release:plan
npm run release:decisions
npm run release:decisions:next
npm run release:decisions:update -- --help
npm run release:manual-gates
npm run release:evidence
npm run release:readiness
npm run security:scan
npm run verify:fresh
```

Machine-readable reports:

```powershell
npm run package:check:json
npm run package:install-smoke:json
npm run next:actions:json
npm run setup:handoff:json
npm run maintainer:pack:json
npm run external:preflight:json
npm run roadmap:next:json
npm run bws:next:json
npm run bws:run:help
npm run bws:acceptance:json
npm run github:safety:json
npm run github:hardening:json
npm run github:hardening:next:json
npm run release:plan:json
npm run release:decisions:json
npm run release:decisions:next:json
npm run release:decisions:update -- --json --id npm-publish-decision --status approved --selected-channel repository-local --evidence "Release owner selected repository-local after package smoke checks."
npm run release:manual-gates:json
npm run release:evidence:json
npm run release:readiness:json
```

## Manual Gates

Before publishing v0.1, confirm:

- `main` has branch protection or a ruleset.
- `Verify` is a required status check.
- Secret scanning and push protection are enabled for the public repo and internal companion repo.
- Provider-live credentials are configured through Bitwarden Secrets Manager and model cost boundaries are approved.
- The npm publish decision is explicit: publish `@xiaoqi-ai/ai-link` or keep repository-local usage.
- The GitHub Release draft in `docs/releases/v0.1.0.md` matches the final public scope.

Use `npm run release:manual-gates` or `npm run release:manual-gates:json` to print the owner, action list, evidence, and safety boundary for each manual gate. The command is read-only: it does not change GitHub settings, create tags, publish npm packages, read secrets, or dispatch provider-live checks.

Use `npm run setup:handoff` or `npm run setup:handoff:json` when you need the ordered handoff across Bitwarden setup, GitHub provider-live wiring, GitHub hardening, release decisions, provider-live cost approval, and release-channel choice. The command is read-only and safe for public logs.

Use `npm run maintainer:pack` or `npm run maintainer:pack:json` when a maintainer needs one consolidated action pack across GitHub UI hardening, Bitwarden local foundation, provider-live GitHub wiring, release decision closeout, provider-live cost approval, and release-channel choice. The command is read-only and safe for public logs.

Use `npm run external:preflight` or `npm run external:preflight:json` immediately before touching Bitwarden or GitHub UI. It is a read-only go/no-go gate that blocks external setup from a dirty or unsynced public repository, reports source-report availability, and never reads or prints secret values.

Use `npm run roadmap:next` or `npm run roadmap:next:json` when you need the public-safe next-step and later-stage roadmap across v0.1 local baseline, external maintainer gates, v0.2 provider acceptance, skill authoring, connector expansion, and later SDK planning.

Use `npm run bws:next` or `npm run bws:next:json` when you need the current Bitwarden setup state and a single `recommendedNext` action. The command is read-only, checks only whether bootstrap variables are present, and never prints token or project-id values.

Use `npm run bws:run:help` before wrapping an approved AI Link command with Bitwarden Secrets Manager. `npm run bws:run -- -CommandLine "..."` requires `BWS_ACCESS_TOKEN` in the current session and does not save or print token values.

Use `npm run bws:acceptance:json` when Codex, CI, or a maintainer handoff needs machine-readable BWS readiness. It reports pass/warn/pending/skip counts and never prints token or secret values.

Use `npm run github:hardening` to generate the GitHub UI worksheet for branch protection, required `Verify`, secret scanning, push protection, and post-configuration evidence. The default worksheet is written under `runtime/tmp/` and is safe for public logs.

Use `npm run github:hardening:next` or `npm run github:hardening:next:json` when you need the next GitHub hardening actions as UI links, read-only verification commands, and public-safe release decision update previews. The command does not call GitHub APIs by default and does not modify release records.

Use `npm run release:decisions` to review the public-safe v0.1 decision record in `docs/releases/v0.1.0-decisions.json`. Use `npm run release:decisions:next` to generate public-safe preview/write commands for each pending decision. Use `npm run release:decisions:update -- --id <decision-id> --status <status> --evidence "<public-safe evidence>"` to preview a decision update, then add `--yes` only after review. `approved` decisions need public-safe evidence, `waived` decisions need a public-safe note, and the updater rejects common secret-like values without echoing them. Use `npm run release:decisions:strict` only when preparing to tag, publish npm, or claim live provider verification; pending decisions intentionally fail strict mode.

Use `npm run release:evidence` to generate a sanitized release evidence bundle at `runtime/tmp/release-evidence.json`. Use `npm run release:evidence:json` when another agent or CI needs machine-readable output without writing the default file.

## Tag And GitHub Release

Only after local and manual gates are accepted:

```powershell
git status --short --branch
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Use `docs/releases/v0.1.0.md` as the GitHub Release body. If any manual gate remains open, keep the release as a draft or postpone tagging.

## npm Package

`package:check` proves the package surface with `npm pack --dry-run`; it is not a publish command. `package:install-smoke` creates a local tarball, installs it into a temporary empty project, and verifies the installed CLI can report its version and validate default config.

If npm publishing is approved, run a final dry-run first:

```powershell
npm publish --dry-run --access public
```

Then publish only after confirming the account, package owner, version, package contents, and GitHub release notes:

```powershell
npm publish --access public
```

Publishing must not be automated until the project has a confirmed release owner and rollback policy.
