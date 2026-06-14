# Auto Ops 示例

这个示例展示 AI Link 第一版的目标工作流：

- `auto_ops.research`：默认用 Grok 调研，失败时回退 DeepSeek、Kimi、mock。
- `auto_ops.article_draft`：默认用 Kimi 写文章草稿，失败时回退 DeepSeek、mock。
- `auto_ops.agent_flow`：默认用 Coze agent provider dry-run，真实执行需要在 `.ai-link/local.yaml` 配置本地命令，失败时回退 mock。
- Codex：负责把输出落到项目文件、验证和 Git 收尾。

## Dry-run

无需 API key，可以先验证路由：

```powershell
npm run ai-link -- run auto_ops.research --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md
```

也可以直接验证完整 workflow：

```powershell
npm run ai-link -- workflow run auto_ops --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md
npm run ai-link -- workflow run auto_ops --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md --output runtime/tmp/auto-ops-example.json
npm run ai-link -- workflow run auto_ops --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md --record
npm run ai-link -- runs list
npm run ai-link -- workflow run auto_ops --config examples/auto-ops/project.yaml --dry-run --stages research --input-file examples/auto-ops/sample-input.md --record
npm run ai-link -- workflow run auto_ops --config examples/auto-ops/project.yaml --dry-run --resume-from latest --input-file examples/auto-ops/sample-input.md
```

`--output` 会写入完整 JSON 结果，方便 Codex skill 或后续脚本继续读取；`--record` 会写入本地运行记录并更新 `runtime/tmp/ai-link-runs/index.json`，之后可用 `runs list` / `runs show <id>` 查看，也可用 `workflow run --resume-from <id|latest>` 续跑剩余阶段。运行产物只写入 `runtime/tmp/`，不要提交到 Git。

## Mock 本地执行

```powershell
npm run ai-link -- run auto_ops.article_draft --config examples/auto-ops/project.yaml --provider mock --input-file examples/auto-ops/sample-input.md
```

## Coze Agent Dry-run

```powershell
npm run ai-link -- run auto_ops.agent_flow --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md
```

真实 Coze 命令请写在 `.ai-link/local.yaml`，不要写入公开示例。

## 自然语言生成 Skill 配置

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地"
```

生成内容会包含 `routes` 和 `workflows`，需要人工确认后再写入项目配置。只想生成 route 时，可以使用 `skill draft-route`。

推荐先预览，再写入本机 local 配置：

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地" --write .ai-link/local.yaml
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地" --write .ai-link/local.yaml --yes
```

没有 `--yes` 时只预览，不写文件。写公开 `.ai-link/project.yaml` 需要额外加 `--allow-public-config`。

## Codex Skill 示例

可复制的 skill 模板见 `examples/codex-skills/auto-ops-ai-link/SKILL.md`。它展示了 Codex 如何把自然语言 skill 意图交给 AI Link 路由，同时仍由 Codex 负责文件、验证和 Git 收尾。
