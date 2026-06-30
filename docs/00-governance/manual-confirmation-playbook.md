# Manual Confirmation Playbook

Status: active handoff for L1/L2 gates.

This playbook explains the project background, current progress, manual confirmation items, decision choices, and recommended decisions for the gates that Codex cannot close alone. It is public-safe: do not add API keys, tokens, Bitwarden values, provider responses, screenshots, QR codes, login state, account-private content, or `runtime/private/` paths.

## Background

AI Link is a public GitHub project that lets Codex route tasks to configured models, agents, and workflows. The current v0.1 baseline is a local-first MVP with TypeScript / Node.js CLI, public configuration, mock and dry-run providers, workflow dry-runs, release readiness checks, GitHub hardening reports, Bitwarden Secrets Manager planning, and an Auth Hub mock skeleton.

The project is intentionally split into public and private boundaries:

- Public repository: code, mock behavior, dry-run checks, public docs, sanitized governance evidence.
- Private/internal boundaries: real secrets, login state, raw provider responses, browser profiles, screenshots, QR codes, platform account data, and undeclassified internal planning.

The practical goal for the current phase is to keep the v0.1 public baseline green while closing or explicitly deferring external gates before any tag, GitHub Release, npm publish, provider-live dispatch, or real connector work.

## Current Progress

As of 2026-06-30:

- Public repository: `xiaoqi-AI/ai_Link`.
- Branch: `main`.
- Local public repository status was clean before this playbook update.
- `npm.cmd run github:safety:json` can use authenticated `gh`.
- Public repo secret scanning: enabled.
- Public repo push protection: enabled.
- Public repo `main` branch protection: not yet configured; GitHub API reported branch not protected.
- Internal companion repo `xiaoqi-AI/ai_Link-internal`: accessible and private.
- Internal companion repo secret scanning and push protection: not verified by API in this session; confirm in GitHub UI.
- Bitwarden Secrets Manager CLI: not available in this session.
- BWS manifest: present and public-safe.
- v0.1 release decisions: still pending in `docs/releases/v0.1.0-decisions.json`.

## Priority Order

1. Configure public `main` branch protection or a repository ruleset.
2. Confirm secret scanning and push protection for both public and internal repositories.
3. Decide the v0.1 release channel.
4. Install or expose the BWS CLI and configure local-dev BWS only if real provider checks are next.
5. Defer provider-live dispatch until BWS setup and cost approval are explicit.
6. Keep Auth Hub remote mock dry-run and real connectors as separate future gates.

## Gate 1: Public Main Protection

### Background

The public repository already has CI and the `Verify` job. Without branch protection or a ruleset, `main` can still be changed without GitHub enforcing that check.

### Current State

Remote read-only check reported secret scanning and push protection as enabled, but branch protection as missing.

### Manual Action

In GitHub UI, configure either a repository ruleset or branch protection for `main`:

- Repository: `xiaoqi-AI/ai_Link`
- Branch target: `main`
- Require status checks to pass.
- Required check: `Verify`
- Restrict force pushes.
- Restrict branch deletions.
- Require pull requests before merging when external contributions begin.
- Optionally require branches to be up to date before merging.

Useful GitHub UI links:

- `https://github.com/xiaoqi-AI/ai_Link/settings/rules`
- `https://github.com/xiaoqi-AI/ai_Link/settings/branches`

### Decision Choices

- Approve after the ruleset or branch protection is configured.
- Waive only for repository-local v0.1 with no tag, GitHub Release, npm publish, or live-provider claim.
- Keep pending/blocking until protection is configured.

### Recommendation

Approve only after configuring `main` protection with required `Verify`. This is the safest next step because it unlocks later release decisions without adding secrets, costs, or new product scope.

### Public-Safe Evidence

Use evidence like:

- `Repository maintainer confirmed main branch protection or ruleset requires Verify.`
- `npm.cmd run github:safety:json reported GitHub branch protection and required Verify as pass.`

Do not attach screenshots or account-private settings exports.

## Gate 2: Secret Scanning And Push Protection

### Background

AI Link is expected to handle provider keys, Bitwarden bootstrap tokens, GitHub Environment secrets, and later connector credentials. GitHub-side scanning reduces the chance that secrets reach the public repository or internal companion repository.

### Current State

Public repo:

- Secret scanning: enabled.
- Push protection: enabled.

Internal companion repo:

- Repo is accessible and private.
- Secret scanning and push protection still need GitHub UI confirmation because the API did not return status fields in this session.

### Manual Action

Confirm settings in GitHub UI:

- Public repo: `https://github.com/xiaoqi-AI/ai_Link/settings/security_analysis`
- Internal repo: `https://github.com/xiaoqi-AI/ai_Link-internal/settings/security_analysis`

Enable or confirm:

- Secret scanning.
- Push protection.

### Decision Choices

- Approve after both public and internal repositories are confirmed.
- Keep pending if only the public repo is confirmed.
- Waive only for repository-local v0.1 with a clear note that release, npm publish, and provider-live claims remain blocked.

### Recommendation

Approve only after the internal companion repo is also reviewed in GitHub UI. The public repo is already good; this gate now mainly needs your confirmation for the private side.

### Public-Safe Evidence

Use evidence like:

- `Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo.`
- `Public repo github:safety check reported secret scanning and push protection as enabled.`

Never test scanning by committing real or fake secret-looking values.

## Gate 3: v0.1 Release Channel

### Background

The v0.1 codebase is useful as a local MVP, but a public release or npm publish creates external expectations. npm publish also requires account ownership, package rollback planning, and final package content review.

### Current State

The release channel is undecided. Release decisions remain pending.

### Decision Choices

- `repository-local`: keep v0.1 as a GitHub repository workflow with no tag, GitHub Release, or npm publish.
- `github-release`: create a `v0.1.0` GitHub Release but do not publish npm.
- `npm-public`: publish `@xiaoqi-ai/ai-link` to npm after dry-run and ownership review.

### Recommendation

Choose `repository-local` for now. The v0.1 value is local MVP, governance, mock/dry-run behavior, and release readiness. Keeping it repository-local avoids premature npm support obligations while GitHub hardening, BWS, provider-live, and Auth Hub gates are still open.

### Public-Safe Evidence

Use evidence like:

- `Release owner selected repository-local after package smoke checks and manual gate review.`

## Gate 4: Bitwarden Secrets Manager

### Background

BWS is the intended path for real provider credentials and GitHub provider-live wiring. The public repo stores only names, expected project structure, and helper scripts. It must not store real secret values.

### Current State

- BWS manifest exists.
- Expected projects:
  - `ai-link-local-dev`
  - `ai-link-ci`
- Expected GitHub Environment:
  - `provider-live`
- BWS CLI is not available in this session.
- `AI_LINK_BWS_PROJECT_ID`, `AI_LINK_BWS_CI_PROJECT_ID`, and `BWS_ACCESS_TOKEN` are not set.

### Manual Action

If real provider checks are the next goal:

- Install or expose the BWS CLI.
- Create or confirm the local-dev BWS project first.
- Keep `BWS_ACCESS_TOKEN` only in the current shell session or hidden prompt flow.
- Do not write token values into project files, docs, issues, PRs, or chat.

### Decision Choices

- Defer BWS and stay dry-run only.
- Configure only local-dev BWS.
- Configure both local-dev and CI provider-live BWS.

### Recommendation

Configure only local-dev first if you want to test real provider readiness. Defer CI provider-live until after branch protection, release channel, and cost boundaries are clear.

## Gate 5: Provider-Live Credentials And Cost

### Background

Provider-live verification can send prompts to external model providers and may spend money. It also creates a public claim if we say live verification passed.

### Current State

Provider-live is blocked by missing BWS setup and missing explicit cost approval.

### Manual Action

Before any live check:

- Choose the provider set.
- Approve outbound prompt content.
- Set a maximum spend.
- Confirm that only sanitized safe reports are saved.

### Decision Choices

- Waive provider-live for repository-local v0.1 and make no live-provider claim.
- Approve one minimal live provider check after BWS local-dev is ready.
- Approve GitHub Actions provider-live only after CI BWS setup is ready.

### Recommendation

Waive provider-live for repository-local v0.1. Do not claim live provider verification yet. Later, run one minimal provider-live safe report after BWS local-dev is configured.

## Gate 6: Auth Hub Remote Mock Dry-Run

### Background

Auth Hub can eventually provide a remote task console and approval loop. Even a mock remote deployment touches Render, Cloudflare Access, app tokens, database settings, and domain configuration.

### Current State

The repo has local and remote helper scripts, but remote deployment remains manual.

### Decision Choices

- Keep Auth Hub local-first.
- Deploy remote mock dry-run behind Cloudflare Access.
- Move toward real connectors.

### Recommendation

Keep Auth Hub remote as a separate future iteration. Do not combine it with GitHub hardening, BWS setup, or release-channel decisions in the same round.

## Decision Recording Commands

Preview first:

```powershell
npm.cmd run release:decisions:next
```

After you confirm GitHub UI settings, use the generated write commands with `--yes`. Recommended sequence:

```powershell
npm.cmd run release:decisions:update -- --id "github-branch-protection" --status "approved" --evidence "Repository maintainer confirmed main branch protection or ruleset requires Verify." --yes
npm.cmd run release:decisions:update -- --id "github-secret-scanning" --status "approved" --evidence "Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo." --yes
npm.cmd run release:decisions:update -- --id "npm-publish-decision" --status "approved" --selected-channel "repository-local" --evidence "Release owner selected repository-local after package smoke checks and manual gate review." --yes
npm.cmd run release:decisions:update -- --id "provider-live-credentials" --status "waived" --note "Release owner waived provider-live verification for repository-local v0.1; do not claim live provider verification." --yes
```

Then verify:

```powershell
npm.cmd run release:decisions:json
npm.cmd run release:readiness:json
npm.cmd run github:safety:json
```

Only run the write commands after the matching manual confirmation exists.
