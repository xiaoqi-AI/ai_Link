---
name: bws-secret-mode
description: Use when the user says "进入 BWS 密钥托管模式" or asks Codex/AI Link to use Bitwarden Secrets Manager for API keys, tokens, passwords, provider-live verification, GitHub Actions secrets, or any secret-backed automation without exposing real secret values.
---

# BWS Secret Mode

Operate AI Link through Bitwarden Secrets Manager while keeping real secret values out of Git, docs, issues, pull requests, chat, and knowledge-base mirrors.

## Entry Check

Start with non-secret state only:

```powershell
git status --short --branch
npm run bws:plan
npm run bws:onboard:print
```

If the user has not explicitly approved live provider calls, keep all AI Link work in dry-run mode.

## Secret Boundary

- Treat secret keys as environment variable names only, for example `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `ARK_API_KEY`, and `XAI_API_KEY`.
- Never ask the user to paste secret values into chat.
- Use hidden prompts or current-session environment variables for `BWS_ACCESS_TOKEN`, `BW_ACCESS_TOKEN`, `GH_TOKEN`, and `GITHUB_TOKEN`.
- Do not write bootstrap tokens to `.env`, project files, docs, issue text, pull requests, screenshots, runtime records, or the knowledge mirror.
- Keep generated worksheets and reports in `runtime/tmp`; do not commit them.

## Local BWS Flow

Use these commands in order when preparing local Codex / AI Link access:

```powershell
npm run bws:profile:print
npm run bws:activate:plan
npm run bws:session
npm run bws:doctor
```

Use `npm run bws:session` when a token is needed because it prompts for `BWS_ACCESS_TOKEN` without echoing it and restores the environment after the child command.

For an explicit BWS-wrapped command:

```powershell
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""<public input>"""
```

Only remove `--dry-run` after the user approves outbound content, provider choice, and cost boundary.

## GitHub Provider-Live Flow

Use the safe previews first:

```powershell
npm run bws:github-vars:apply-plan
npm run providers:github:dispatch-plan
```

After Bitwarden and GitHub are configured, verify names before dispatching:

```powershell
npm run providers:github:remote-check
npm run bws:acceptance:strict
```

Trigger GitHub provider-live only when the user explicitly confirms the model-cost boundary:

```powershell
npm run providers:github:dispatch
npm run providers:github:dispatch-strict
```

The dispatcher must not read or print provider API keys. GitHub stores `BW_ACCESS_TOKEN` as an Environment Secret and stores `BWS_*_SECRET_ID` as Environment Variables.

## Closeout

Before handing off, run the non-secret checks that match the change:

```powershell
npm run bws:acceptance:print
npm run security:scan
git status --short --branch
```

For repository changes, also run project validation and mirror checks:

```powershell
npm run check
npm test
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

Report which BWS items remain pending, especially missing project IDs, `BWS_ACCESS_TOKEN`, GitHub `BW_ACCESS_TOKEN`, `BWS_*_SECRET_ID` variables, and any intentionally skipped live provider verification.
