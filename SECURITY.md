# Security Policy

## Supported status

`ai_Link` is currently in workspace initialization. There is no stable release channel yet.

## Reporting a vulnerability

Do not post secrets, exploit details, credentials, QR codes, login states, private screenshots, or personal data in a public issue.

For non-sensitive security hardening suggestions, open a GitHub issue and keep the report general. For sensitive vulnerabilities, contact the repository owner through an appropriate private channel before disclosing details publicly.

## Sensitive data boundary

The repository must not contain:

- API keys, tokens, passwords, private keys, certificates
- `BWS_ACCESS_TOKEN`, `BW_ACCESS_TOKEN`, or any Bitwarden machine account access token
- QR codes or login state files
- Undesensitized screenshots or personal data
- Personal finance or trading records
- Files under `runtime/private/`

## Secret manager boundary

AI Link recommends Bitwarden Secrets Manager for API keys and automation tokens. Public repository files may document environment variable names such as `DEEPSEEK_API_KEY` or `AI_LINK_EXECUTOR_TOKEN`, but must never include their real values.

Local Codex and AI Link automation should receive secrets through `bws run` at execution time. Do not save Bitwarden access tokens in `.env`, project config, issue text, pull requests, screenshots, or knowledge-base mirrors.
