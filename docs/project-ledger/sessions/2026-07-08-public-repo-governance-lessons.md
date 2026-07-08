# 2026-07-08 Public Repository Governance Lessons

## Summary

This session consolidated public-repository operating lessons from the v0.1 repository-local release work, GitHub hardening, Coze provider-live verification, and Hermes-to-AI-Link Coze `stream_run` reuse.

The key lesson is that AI Link should act as a public-safe provider governance and verification layer, not as the owner of another project's business workflow. Hermes can keep its own Coze orchestration, while AI Link records the reusable provider boundary, live verification posture, and safe evidence handling.

## Public Repository Role

AI Link is a public repository. Public updates should prefer reusable code, safe docs, sanitized decision records, and governance evidence.

Public-safe content includes:

- provider names, provider types, and non-secret API shapes
- dry-run behavior
- safe live verification summaries
- release decision status and public-safe evidence
- GitHub settings names and sanitized check results
- non-secret deployment shape when explicitly treated as public-safe

Public content must not include:

- API tokens, token fragments, cookies, refresh tokens, JWT private keys, or machine-account tokens
- raw provider responses, full prompts, full request bodies, or private logs
- screenshots containing account-private settings, QR codes, login state, or secret material
- `runtime/private/` contents
- unredacted internal project assumptions

## Manual Gates

Manual gates should be treated as project decisions, not incidental blockers. Each gate needs:

- project background
- current progress
- the exact decision item
- available options
- recommendation
- value
- risks
- public-safe evidence wording

During this round:

- `main` protection was configured and recorded.
- secret scanning and push protection were recorded.
- v0.1 release channel was approved as `repository-local`.
- local Coze `stream_run` live verification passed.
- GitHub Actions / CI-level provider-live dispatch remains unconfigured.

The remaining provider-live decision should not be overstated. Current evidence supports local live verification only, not a CI-level provider-live claim.

## Coze Provider Boundary

AI Link already has a `coze` provider slot. The correct path is to continue using the provider live adapter, not to add a content-platform connector.

Useful boundary statement:

```text
This is not for AI Link to take over the Hermes main workflow. It lets AI Link's Coze provider reuse the same deployed stream_run integration experience.
```

Hermes should keep:

- Collector -> Curator -> Writer orchestration
- article quality gates
- source binding validation
- visual asset handoff
- publication-prep workflow

AI Link should keep:

- provider registration shape
- dry-run / live verification entry points
- policy and human approval boundaries
- safe report generation
- public-safe release evidence
- reusable documentation for future projects

## Coze `stream_run` Lessons

The earlier Bot Chat API path is not the only Coze path. Coze Code deployment sites expose a deployed API shape:

```text
POST https://xxxx.coze.site/stream_run
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

For the AI Link adapter, the reusable shape is:

- keep the adapter private under `runtime/private/`
- configure it through `.ai-link/local.yaml`
- read tokens from the current environment or another private script
- pass the AI Link request envelope through `content.query.prompt[0].content.text`
- parse `text/event-stream`
- extract `content.answer`
- write only safe summaries to `runtime/tmp/provider-live-report.json`
- write raw responses only to `runtime/private/` and only when explicitly enabled

When reusing another project's live configuration, do not copy secrets into AI Link. Load them from the owning project's private environment, and map only the required environment variable names for the current session.

## Evidence Wording

Good public evidence:

```text
Local Coze stream_run live verification passed using Hermes-managed private tokens and public-safe deployment registry; safe report generated at runtime/tmp/provider-live-report.json; GitHub provider-live dispatch remains unconfigured and no CI-level live verification claim is made.
```

Bad public evidence:

- raw token values or token fragments
- full request/response logs
- raw Coze output
- private account identifiers
- private runtime paths other than generic ignored locations
- screenshots of API token pages

## GitHub Operations

Protected `main` should be updated through PRs with `Verify` passing.

When local `git push` or `git fetch` over HTTPS fails but `gh` API access works, GitHub API can be used as a temporary transport fallback:

- create a blob from the local public-safe file content
- create a tree on top of remote `main`
- create a commit
- create or update a remote branch ref
- open a PR with `gh pr create`
- wait for `gh pr checks`
- merge through `gh pr merge`

This fallback should only upload reviewed public-safe files. It must not upload private files, ignored runtime files, local secret configs, or generated logs.

## Knowledge Mirror

For important work, keep the project mirror synchronized:

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

The mirror is context and handoff support, not the source of truth. GitHub remains the source of truth for public repository state.

## Release Posture

The current v0.1 posture remains:

- repository-local
- no npm publish
- no CI-level live provider claim
- local Coze live evidence recorded
- provider-live dispatch still pending until GitHub Environment / Bitwarden wiring is configured

This keeps v0.1 honest: local provider capability is proven, but public release claims remain limited to what has actually been configured and verified.

## Next Recommended Actions

1. Sync local `main` when Git HTTPS transport recovers.
2. Keep v0.1 focused on repository-local closeout.
3. Decide whether provider-live should remain pending, be waived for repository-local, or be fully completed through GitHub Environment / Bitwarden.
4. If provider-live is fully completed later, run the GitHub `Provider Live Verification` workflow and record only the safe artifact summary.
5. Keep Hermes business orchestration in Hermes; reuse AI Link only for provider governance, verification, and cross-project adapter lessons.
