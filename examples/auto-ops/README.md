# Auto Ops 示例

这个示例展示 AI Link 第一版的目标工作流：

- `auto_ops.research`：默认用 Grok 调研，失败时回退 DeepSeek、Kimi、mock。
- `auto_ops.article_draft`：默认用 Kimi 写文章草稿，失败时回退 DeepSeek、mock。
- `auto_ops.agent_flow`：扣子工作流预留，当前用 mock 兜底。
- Codex：负责把输出落到项目文件、验证和 Git 收尾。

## Dry-run

无需 API key，可以先验证路由：

```powershell
npm run ai-link -- run auto_ops.research --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md
```

也可以直接验证完整 workflow：

```powershell
npm run ai-link -- workflow run auto_ops --config examples/auto-ops/project.yaml --dry-run --input-file examples/auto-ops/sample-input.md
```

## Mock 本地执行

```powershell
npm run ai-link -- run auto_ops.article_draft --config examples/auto-ops/project.yaml --provider mock --input-file examples/auto-ops/sample-input.md
```

## 自然语言生成 Skill 配置

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地"
```

生成内容会包含 `routes` 和 `workflows`，需要人工确认后再写入项目配置。只想生成 route 时，可以使用 `skill draft-route`。

## Codex Skill 示例

可复制的 skill 模板见 `examples/codex-skills/auto-ops-ai-link/SKILL.md`。它展示了 Codex 如何把自然语言 skill 意图交给 AI Link 路由，同时仍由 Codex 负责文件、验证和 Git 收尾。
