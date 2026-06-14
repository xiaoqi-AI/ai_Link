# Auth Hub Audit Handoff Smoke

Date: 2026-06-15

## What changed

- Added `tools/test-auth-hub-audit-handoff.ps1`.
- Added `npm run auth-hub:audit-smoke`.
- Fresh clone verification now runs the audit handoff smoke after dry-run workflow checks.

## What it verifies

- Starts or reuses a local Auth Hub.
- Creates a safe public test task.
- Runs `ai-link workflow run auto_ops --dry-run --record`.
- Submits the latest run record audit to Auth Hub with `ai-link runs submit-audit`.
- Reads `/api/audit?eventType=ai_link.audit` and confirms the audit summary is present.
- Confirms the audit response does not include the raw smoke-test input text.

## Safety boundary

- Uses local development tokens unless explicit tokens are passed.
- Does not call live external providers.
- Does not store API keys, provider tokens, cookies, screenshots, or raw private content.
