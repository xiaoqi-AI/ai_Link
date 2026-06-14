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
- Auth Hub public MVP skeleton with mock connectors, local executor, audit handoff, deployment checks, and safety boundaries.
- 5-minute public quickstart for trying AI Link without provider keys or live model calls.
- Release manual gates report for GitHub protection, secret scanning, npm publish decision, and provider-live cost approval.
- Public onboarding, package contents, package install smoke, GitHub repository safety, provider verification, release planning, release manual gates, release readiness, fresh clone, skill, and security checks.

### Safety

- Real external provider calls require explicit approval and configured private credentials.
- Public repo checks avoid reading `.env`, tokens, login state, provider responses, QR codes, browser state, or `runtime/private`.
- `package:check` uses `npm pack --dry-run` and does not publish.
- `package:install-smoke` installs a local tarball into a temporary empty project and does not publish.
- `github:safety` is read-only; it does not modify GitHub settings.
- `release:plan`, `release:manual-gates`, and `release:readiness` do not create tags, publish npm packages, modify GitHub settings, or trigger live provider calls.

### Pending Decisions

- Whether to publish `@xiaoqi-ai/ai-link` to npm for v0.1 or keep repository-local usage.
- Whether to create and publish the `v0.1.0` GitHub Release now or after live provider acceptance.
- GitHub UI configuration for branch protection, required checks, secret scanning, and push protection.
- Live provider credentials, cost boundaries, and final approval for provider-live verification.
- Whether Coze real integration should prioritize API, MCP, or another adapter path.
