# 2026-06-15 Coze Agent Provider

## 本次推进

- `coze` 从预留 provider 升级为可运行的 agent provider。
- 支持 dry-run，不执行任何本地命令。
- 支持本机命令适配：`provider.command` + `provider.args`，任务通过 stdin JSON 传入。
- 支持纯文本、单个 JSON 和 NDJSON 事件流输出，优先提取 `output` / `content` / `reply_content`。
- 默认 `auto_ops.agent_flow` 改为 `coze`，fallback 到 `mock`；默认 `auto_ops` workflow 增加 `agent_flow` 第三阶段。
- dry-run 和运行 metadata 只显示 command 是否已配置和 args 数量，不打印具体命令、参数值或路径。

## 安全边界

- 公开配置只放 provider 名称、模型名和能力标签。
- 真实 Coze 命令、登录态、workspace、账号信息和私有路径必须放在 `.ai-link/local.yaml` 或用户全局配置。
- Agent 输出只作为 Codex 的输入材料；Codex 继续负责文件写入、验证、安全判断和 Git 收尾。

## 后续建议

- 调研 Coze 官方 API 或 MCP 接入，减少对本地 CLI 命令形态的依赖。
- 给 agent provider 增加更明确的 command schema 和命令白名单策略。
- 为 Coze live 验收增加可选本地 smoke，但默认不读取登录态。
