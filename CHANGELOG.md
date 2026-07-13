# Changelog

## 0.1.0 - Unreleased

AI Link v0.1.0 is the first public MVP for routing Codex tasks to configured models, agents, and workflows.

### Added

- `ai-link` local CLI with config validation, provider verification, route execution, workflow execution, run records, and natural-language skill draft generation.
- Configuration precedence: session override > project local private config > project public config > user global config > default config.
- Providers for `mock/local-dry-run`, `openai-compatible`, DeepSeek, Kimi, Doubao, Grok, and Coze agent dry-run / local command workflows.
- Default `auto_ops` workflow: Grok research, Kimi article draft, and Coze agent workflow dry-run.
- Route policies for outbound approval, provider type gates, model pattern gates, budget gates, sensitive text blocking, and audit metadata.
- Structured JSON handoff for Codex skills, CI, and other agents through `--json` and `--output runtime/tmp/*.json`.
- Bitwarden Secrets Manager runbooks and checks for keeping provider keys out of Git.
- BWS next-step report for showing current Bitwarden setup state and the next safe command without printing token values.
- BWS run wrapper npm entry for running approved AI Link commands through `bws run` without saving token values.
- BWS acceptance JSON report for machine-readable pass/warn/pending/skip handoff without printing token values.
- Auth Hub public MVP skeleton with mock connectors, local executor, audit handoff, deployment checks, and safety boundaries.
- Google Search Console connector contract with mock Google API data, live read-only public crawlability checks, normalized URL states, Chinese reports, and an Auth Hub `gsc_monitor` task.
- Google Search Console Desktop OAuth PKCE/loopback authorization, in-memory access-token refresh, and live read-only Sites, URL Inspection, and Sitemaps REST client.
- Redacted GSC snapshot history, Chinese change summaries, and a plan-first Windows daily monitoring task installer.
- Platform authorization P0.1 contracts for Xiaohongshu read-only sessions/search, WeChat Official API health checks, stable action codes, and local private connector injection.
- GitHub P0.2 private authorization probe with target-required, scope-specific Contents/Actions/Pull requests GET endpoints and public-safe rate-limit, credential, platform and network failure classification.
- Xiaohongshu P0.2 private command-adapter scaffold with structured JSON transport, strict runtime/private path checks, approval-gated interactive login, bounded concrete-note output, and fail-closed bridge errors.
- Private connector bundle generator that safely combines the GitHub, WeChat Official and Xiaohongshu adapters while rejecting missing modules and duplicate platform ownership.
- Auth Hub executor capability heartbeat with strict allowlists, server-side TTL, static-contract/runtime-evidence separation, fail-closed unverified states, and mock-only remote smoke enforcement.
- Auth Hub explicit connector probe evidence for GitHub, WeChat Official, and Xiaohongshu health operations, with token-bound executor identity, process-session binding, one-time leases, atomic Postgres settlement, server-side TTL, operation-scoped status, and platform-filtered strict checks.
- Auth Hub remote origin hardening with fail-closed Cloudflare Access JWT verification, verified user/service identity binding, and signed server-side console session expiry.
- 5-minute public quickstart for trying AI Link without provider keys or live model calls.
- Next-action report for local baseline, GitHub hardening, Bitwarden setup, provider-live, and v0.1 release decisions.
- Ordered setup handoff for Bitwarden, GitHub provider-live, GitHub hardening, release decisions, provider-live cost approval, and release-channel choice.
- Maintainer action pack for one safe handoff across GitHub UI, Bitwarden, provider-live, release decisions, and release-channel work.
- GitHub hardening next-step report for UI links, verification commands, and public-safe decision update previews.
- Public v0.1 release decision record for tracking pending, approved, waived, and blocked release gates.
- Public-safe release decision next-command report for generating preview/write commands for each pending decision.
- Public-safe release decision update helper that previews by default and writes only with `--yes`.
- Release manual gates report for GitHub protection, secret scanning, npm publish decision, and provider-live cost approval.
- Release evidence bundle for sanitized v0.1 readiness handoff under `runtime/tmp/`.
- Public onboarding, package contents, package install smoke, GitHub repository safety, provider verification, release planning, release manual gates, release evidence, release readiness, fresh clone, skill, and security checks.

### Safety

- Real external provider calls require explicit approval and configured private credentials.
- Public repo checks avoid reading `.env`, tokens, login state, provider responses, QR codes, browser state, or `runtime/private`.
- GSC public checks are same-origin HTTPS only; OAuth credentials must remain under `runtime/private/` or an external secret manager, the authorization CLI requests read-only scope only, and Search Console writes and Request indexing remain separately gated.
- Private connector modules are accepted only from the repository-local `runtime/private/` boundary; public results are rebuilt through an allowlist before they reach Auth Hub.
- Approval requests now require an explicit approve/reject decision; an approval ID by itself can no longer default to approval.
- Interactive platform login is fail-closed and calls the Xiaohongshu private bridge only after the dedicated Auth Hub approval step; the public repository never performs unattended login or bypasses verification.
- Exact query-free Xiaohongshu note URLs are preserved by redaction while tokenized URLs, account fields and raw bridge output remain blocked.
- Executor heartbeats never invoke platform methods or carry hostnames, private paths, credentials, login state, account details, or raw responses; without a separate read-only probe, `canRunReal` remains false.
- Connector probes are never inferred from mock, heartbeat, status reads, search, login, or historical tasks; replayed/expired/mismatched attempts are rejected, and public API/UI omit executor sessions, lease IDs, heartbeat revisions, client timestamps, raw results, credentials, and platform account details.
- Cloudflare Access enforcement never trusts forwarded identity headers without a valid RS256 application JWT for the configured issuer and audience; console sessions carry a signed absolute expiry and malformed cookies fail closed.
- The Render blueprint no longer hard-codes the existing `voice.xiao-qi-ai.com` application as the Auth Hub target; production deployment requires an explicitly confirmed dedicated hostname.
- `package:check` uses `npm pack --dry-run` and does not publish.
- `package:install-smoke` installs a local tarball into a temporary empty project and does not publish.
- `next:actions` is read-only; it does not read secrets, modify GitHub settings, publish packages, or dispatch live providers.
- `setup:handoff` is read-only; it does not read secrets, modify GitHub settings, publish packages, write Bitwarden secrets, or dispatch live providers.
- `maintainer:pack` is read-only; it does not modify GitHub, Bitwarden, release records, tags, npm packages, or provider-live workflows.
- `bws:next` is read-only; it reports token and project-id presence only and does not print values.
- `bws:run` requires session-scoped BWS credentials and does not save or print token values.
- `bws:acceptance:json` reports readiness status only and does not print token or secret values.
- `github:safety` is read-only; it does not modify GitHub settings.
- `github:hardening:next` is read-only; it does not call GitHub APIs or modify GitHub settings.
- `release:decisions` reads only the public decision record and does not approve gates by itself.
- `release:decisions:next` reads only the public decision record and prints preview/write commands without modifying files.
- `release:decisions:update` rejects secret-like input and writes only to the public decision record after explicit `--yes`.
- `release:evidence` writes only to `runtime/tmp/` by default and does not read secret values.
- `release:plan`, `release:decisions`, `release:manual-gates`, `release:evidence`, and `release:readiness` do not create tags, publish npm packages, modify GitHub settings, or trigger live provider calls.

### Pending Decisions

- Whether to publish `@xiaoqi-ai/ai-link` to npm for v0.1 or keep repository-local usage.
- Whether to create and publish the `v0.1.0` GitHub Release now or after live provider acceptance.
- GitHub UI configuration for branch protection, required checks, secret scanning, and push protection.
- Live provider credentials, cost boundaries, and final approval for provider-live verification.
- Whether Coze real integration should prioritize API, MCP, or another adapter path.
