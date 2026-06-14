# Provider Live 安全摘要工件

日期：2026-06-15

## 背景

Provider live 验收会调用真实外部模型，日志和原始响应不适合进入公开 issue、PR、知识库或长期交接。上一阶段已经让 `providers verify --json` 输出机器可读报告，本阶段继续补上脱敏摘要和 GitHub Actions 工件。

## 本次推进

- `ai-link providers verify` 增加 `--safe` / `--safe-json` / `--summary-only` 摘要模式。
- `--safe` 会保留 `summary` 和逐个 provider 状态，但成功项不包含模型输出，未知失败项只提示查看私有日志。
- `providers verify` 支持 `--output runtime/tmp/*.json`，并沿用运行态目录写入保护。
- 新增 `providers:live:safe-report` 和 `providers:live:safe-report:strict`。
- GitHub `Provider Live Verification` workflow 改为运行安全报告脚本，并上传 `provider-live-summary` artifact。
- `providers:github:check` 会检查 workflow 是否使用安全报告脚本并上传 `runtime/tmp/provider-live-report.json`。

## 安全边界

`runtime/tmp/provider-live-report.json` 默认不进入 Git。公开沟通只引用 `summary`、provider 名称、类型、模式和状态；不引用完整日志、完整请求、完整响应、API key、账号信息、平台原始内容或模型输出。

## 后续

等 GitHub `provider-live` Environment 和 Bitwarden machine account 完成后，可用 `providers:github:dispatch` 或 `providers:github:dispatch-strict` 触发真实验收，再下载 `provider-live-summary` artifact 作为脱敏验收证据。
