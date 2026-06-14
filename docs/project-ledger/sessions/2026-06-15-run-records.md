# 2026-06-15 本地运行记录

## 本次变化

- `ai-link run` 和 `ai-link workflow run` 新增 `--record` / `--record-run`。
- 运行记录写入 `runtime/tmp/ai-link-runs/<timestamp>-<name>-<id>.json`。
- 本地索引写入 `runtime/tmp/ai-link-runs/index.json`，最多保留 50 条记录入口。
- `tools/verify-fresh-clone.js` 增加 `--record` 验证。

## 安全边界

- 记录不保存原始 input，只保存 input 长度、配置选择和结构化结果。
- provider 输出仍可能包含任务内容，因此记录仍属于本地运行态。
- `runtime/tmp/` 被 Git 忽略，不应提交，也不应同步进知识库。

## 用途

- Codex skill 或后续脚本可以通过本地索引找到最近一次 AI Link 结果。
- 在 BWS 模式下，真实 key 仍只通过环境变量临时注入；运行记录不保存 key 或 token。
