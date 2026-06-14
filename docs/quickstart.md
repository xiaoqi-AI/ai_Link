# AI Link 5-Minute Quickstart

This guide is the shortest safe path for trying AI Link from a public clone.
It does not require provider API keys and does not call real external models.

## Requirements

- Node.js 20 or newer.
- Git.
- A terminal in the repository root.

## 1. Install

```powershell
npm ci
```

If you are experimenting outside a clean clone, `npm install` is also fine.
Maintainers should prefer `npm ci` for repeatable checks.

## 2. Read The Local Onboarding Snapshot

```powershell
npm run onboard:print
```

This prints the current providers, routes, workflows, first dry-run path, and
safety notes. It does not read API keys, `.env`, login state, browser state, QR
codes, or provider responses.

## 3. Validate The Public Config

```powershell
npm run ai-link -- config validate
```

Expected result: configuration validation passes for `.ai-link/project.yaml`.

## 4. Verify Providers In Dry-Run Mode

```powershell
npm run providers:dry
```

Expected result: AI Link shows the configured provider adapters without making
real provider calls.

## 5. Run The Auto Ops Workflow

```powershell
npm run workflow:dry
```

Expected result: the default `auto_ops` workflow routes research to Grok,
article drafting to Kimi, and agent workflow handling to Coze in dry-run mode.

## 6. Preview A Skill Route From Natural Language

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "research with Grok, article draft with Kimi" --write .ai-link/local.yaml --diff --json
```

This previews the local config change and prints a JSON diff. It does not write
`.ai-link/local.yaml` unless you add `--yes`.

## 7. Try A No-Key Mock Run

```powershell
npm run ai-link -- run auto_ops.article_draft --provider mock --input "write a short draft"
```

Use this path when you want a command that works without provider credentials.

## Next Steps

- Save structured workflow output with `--output runtime/tmp/auto-ops-workflow.json`.
- Keep a local run record with `--record`, then inspect it with `npm run ai-link -- runs list`.
- Run `npm run next:actions` when you want the current top-level handoff map.
- Run `npm run setup:handoff` when you want the ordered Bitwarden, GitHub, provider-live, and release setup checklist.
- Run `npm run bws:next` when you want the current Bitwarden setup state and the next safe command.
- Run `npm run bws:run:help` when you want the wrapper for running approved AI Link commands through `bws run`.
- Run `npm run github:hardening` when a maintainer is ready to review GitHub branch protection and secret scanning setup.
- Run `npm run github:hardening:next` when a maintainer wants GitHub UI links plus public-safe release decision preview commands.
- Configure real provider keys through Bitwarden Secrets Manager before using live providers.
- Run `npm run package:install-smoke` before publishing or distributing a package build.
- Run `npm run release:decisions` to review the v0.1 public-safe decision record.
- Run `npm run release:decisions:next` to generate preview/write commands for each pending decision.
- Run `npm run release:decisions:update -- --id npm-publish-decision --status approved --selected-channel repository-local --evidence "Release owner selected repository-local after package smoke checks."` to preview a safe decision update; add `--yes` only after review.
- Run `npm run release:manual-gates` to review the manual release decisions before public release work.
- Run `npm run release:evidence` to generate a sanitized release evidence bundle.
- Run `npm run release:readiness` before creating a public release.
