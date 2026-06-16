---
name: ai-link-skill-author
description: Use when Codex should create or update a Codex skill that routes model, agent, and workflow stages through AI Link from natural-language instructions while keeping secrets and local execution under Codex control.
---

# AI Link Skill Author

Use this skill when a user wants to create a new Codex skill that delegates research, drafting, agent workflow, or other stages to AI Link.

External models and agents provide draft material only. Codex keeps responsibility for local files, commands, validation, Git, and final judgment.

## Start With The Boundary Card

Read or copy `docs/90-templates/ai-link-skill-authoring.md` before implementing a new skill. Keep the scope to one main deliverable.

Confirm these four fields in the working notes or handoff:

- Requirement: user goal, success standard, natural-language intent, output shape, non-goals.
- Expected work: target skill folder, route/workflow config target, expected docs or examples, files not to touch.
- Verification: `skill draft` preview, dry-run workflow, `skills:check`, and safety scan when public files change.
- Boundary control: stop if real provider calls, account access, publishing, secrets, or broad platform work become necessary.

## Draft Route And Workflow Config

Generate a preview from the user instruction:

```powershell
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>"
```

Preview a merge into private local config:

```powershell
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/local.yaml --diff --json
```

Only write after review:

```powershell
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/local.yaml --diff --json --yes
```

Do not write `.ai-link/project.yaml` unless the maintainer explicitly wants the route or workflow to become public project behavior. Public config writes must use `--allow-public-config`.

## Author The Skill

Create `examples/codex-skills/<skill-name>/SKILL.md` with frontmatter:

```yaml
---
name: <skill-name>
description: Use when Codex should <clear trigger and user-facing value>.
---
```

The body should state:

- When the skill should run.
- Which AI Link workflow or route to call first.
- Which stage overrides are expected.
- When provider output is only input material for Codex.
- Which checks prove the task is complete.
- Which secrets, login state, account data, and runtime files must stay out of Git.

## Verify

Run local checks before handoff:

```powershell
npm run skills:check
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/local.yaml --diff --json
npm run ai-link -- workflow run <workflow-name> --dry-run --input "<public task brief>"
```

If the skill or docs are public-facing, also run:

```powershell
npm run check
npm run security:scan
```

## Safety

Do not include API keys, tokens, `.env` values, Bitwarden values, login state, QR codes, private screenshots, account data, raw provider responses, private connector payloads, or `runtime/private` content in the skill, docs, run records, Git, issues, PRs, or chat.

Do not remove `--dry-run`, add `--approve-policy`, or use `--approve-stage` unless the user has approved the provider, prompt boundary, cost, and secret source.

