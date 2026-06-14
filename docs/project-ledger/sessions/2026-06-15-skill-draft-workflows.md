# 2026-06-15 Skill Draft 生成 Workflow

## 本次推进

- 新增 `ai-link skill draft`，从自然语言 skill 说明生成候选 `routes` 和 `workflows`。
- 保留 `ai-link skill draft-route`，继续用于只生成 route 的兼容场景。
- 自然语言解析按用户描述的语句顺序生成 workflow stage，避免只按 provider 列表排序。
- `npm run verify:fresh` 增加 `skill draft` 验证，确保外部 fresh clone 可用。

## 设计边界

- 草稿只写公开配置结构，不生成真实 API key、账号、token 或私有 endpoint。
- `coze`、`doubao` 等尚未完整 runtime 接入的 provider 可以出现在候选 route 中，但需要用户或 Codex 审核后再写入正式配置。
- Codex 仍负责把候选配置审阅、落盘、验证和提交；外部模型/Agent 不获得本地执行权。

## 后续建议

- 为 `skill draft` 增加 `--write` 前的显式确认流程，避免自动覆盖项目配置。
- 为 Agent stage 增加真实 Coze / MCP adapter。
- 为生成结果增加更明确的 warning，提示缺失 provider 需要在 local 或全局配置补齐。
