---
name: auto-ops-ai-link
description: Use when Codex should run an automated-operations skill through AI Link, routing research to Grok, article drafting to Kimi, optional agent workflow stages to the configured agent, and keeping Codex responsible for local edits, validation, and Git closeout.
---

# Auto Ops With AI Link

Use AI Link as the model and workflow router. External models provide research, drafts, or structured workflow outputs; Codex keeps control of files, commands, verification, and Git.

## Default Workflow

Run the configured workflow first:

```powershell
npm run ai-link -- workflow run auto_ops --dry-run --input "<public task brief>"
npm run ai-link -- workflow run auto_ops --dry-run --input "<public task brief>" --output runtime/tmp/auto-ops-workflow.json
npm run ai-link -- workflow run auto_ops --dry-run --input "<public task brief>" --record
npm run ai-link -- runs list --limit 5
npm run ai-link -- workflow run auto_ops --dry-run --stages research --input "<public task brief>" --record
npm run ai-link -- workflow run auto_ops --dry-run --resume-from latest --input "<public task brief>"
```

Use `--output runtime/tmp/*.json` when the next step needs structured handoff. AI Link refuses output paths outside `runtime/tmp/`; the output file is local runtime state and should not be committed.
Use `--record` when the next step needs a local run index for audit or continuation. Records live under `runtime/tmp/ai-link-runs/`; use `runs list` and `runs show <id> --json` to inspect them, and `workflow run --resume-from <id|latest>` to continue a workflow record. Add `--from-stage <stage>` when a later stage should be rerun. Records do not store the original input in the request block and should not be committed. Provider output may still echo task content.

For a real provider call, remove `--dry-run` only after the user has approved outbound content and provider keys are available through the configured secret manager.

## Stage Overrides

Run selected stages when the user narrows the task:

```powershell
npm run ai-link -- workflow run auto_ops --stages research --dry-run --input "<public research brief>"
npm run ai-link -- workflow run auto_ops --stages research,article_draft --dry-run --input "<public article brief>"
npm run ai-link -- run auto_ops.agent_flow --dry-run --input "<public workflow brief>"
```

If the user asks for a temporary model change, pass it as a session override:

```powershell
npm run ai-link -- run auto_ops.research --provider deepseek --dry-run --input "<public research brief>"
```

## New Skill Draft

When creating a related skill, draft route and workflow config from the natural-language instruction:

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "research with Grok, write with Kimi, Codex does implementation and checks"
```

Review the output before writing it to `.ai-link/project.yaml` or `.ai-link/local.yaml`.

Preview a merge into local config:

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "research with Grok, write with Kimi, Codex does implementation and checks" --write .ai-link/local.yaml
```

Write only after review:

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "research with Grok, write with Kimi, Codex does implementation and checks" --write .ai-link/local.yaml --yes
```
Use `skill draft-route` only when you want route entries without a workflow.

## Safety

Do not send secrets, tokens, login state, private screenshots, account data, or unredacted private content to external providers. Treat provider output as input material, then Codex verifies, edits, tests, and closes the work.

For live Coze execution, require a reviewed `.ai-link/local.yaml` command adapter. Keep login state, workspace details, and account-specific values out of public config.
