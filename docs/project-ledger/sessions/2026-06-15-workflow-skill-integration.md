# 2026-06-15 Workflow 与 Codex Skill 集成推进

## 本次推进

- 新增 `ai-link workflow run <workflow>`，支持按顺序执行多个 route stage。
- 默认 `auto_ops` workflow：`research` 使用 `auto_ops.research`，`article_draft` 使用 `auto_ops.article_draft`，后者接收前序阶段输出。
- 配置新增 `workflows` 结构，并纳入 `ai-link config validate` 校验。
- 新增可复制 Codex skill 示例：`examples/codex-skills/auto-ops-ai-link/SKILL.md`。
- `npm run workflow:dry` 和 `npm run verify:fresh` 纳入 workflow dry-run 验证。

## 设计边界

- 外部模型和 Agent 只产出调研、草稿或结构化材料，不直接获得本地命令执行权。
- Codex 继续负责文件修改、验证、安全判断、Git 收尾和公开仓脱敏。
- 第一版 workflow 只做顺序串联；条件分支、人工审批节点、Agent 长任务回调留到后续。

## 后续建议

- 为 Coze / MCP Agent 增加真实 agent stage adapter。
- 为 workflow 增加 `--json` 产物写入和可恢复运行记录。
- 为公开示例补一个更完整的“新 skill 制作流程”演示。
