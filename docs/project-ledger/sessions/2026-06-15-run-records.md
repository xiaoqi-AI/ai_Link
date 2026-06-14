# 2026-06-15 本地运行记录

## 本次变化

- `ai-link run` 和 `ai-link workflow run` 新增 `--record` / `--record-run`。
- 运行记录写入 `runtime/tmp/ai-link-runs/<timestamp>-<name>-<id>.json`，并更新 `runtime/tmp/ai-link-runs/index.json`。
- fresh clone 验证纳入 `workflow run auto_ops --record`，确保公开仓用户可以直接试跑。
- 用户指南、Codex skill 调用约定和 auto-ops 示例补充运行记录说明。

## 使用边界

- `--output runtime/tmp/*.json` 用于给下一步稳定读取完整结构化结果。
- `--record` 用于留下本地运行索引，方便复盘、续跑设计和自动化交接。
- 运行记录不会在 `request` 中单独保存原始 input，只保存 input 长度、配置选择和结构化结果。
- provider 输出可能回显任务内容，因此运行记录仍属于本地运行态，不提交 Git、不同步知识库、不要复制到公开 issue 或 PR。

## 后续方向

1. 在运行记录基础上设计 `ai-link runs list/show`。
2. 评估 workflow 手动审批节点和失败后从指定 stage 续跑。
3. 为 Agent 长任务增加回调或轮询状态记录。
