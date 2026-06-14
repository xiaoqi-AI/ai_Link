# Provider 验收 JSON 报告

日期：2026-06-15

## 背景

Provider dry-run / live 验收已经能跑通，但 `--json` 之前只输出逐行 provider 结果。Codex skill、CI、GitHub Actions 或其他 agent 需要更稳定的顶层判断字段，否则只能自行遍历表格行。

## 本次推进

- `ai-link providers verify --json` 改为输出带 `summary` 的机器可读报告。
- 新增 `npm run providers:dry:json`，默认不访问外部模型，不读取真实 API key。
- `verify:fresh` 纳入 `providers:dry:json`，确保公开用户 fresh clone 路径覆盖该入口。
- Onboarding 把 `providers:dry:json` 加入公开用户第一条 dry-run 路径和脚本检查。

## 报告结构

- `summary.ok`：是否没有失败项。
- `summary.mode`：`dry-run` 或 `live`。
- `summary.strict`：是否启用严格模式。
- `summary.counts`：`ok`、`skipped`、`failed` 和 `total`。
- `providers`：逐个 provider 的状态摘要。

## 安全边界

dry-run JSON 可安全用于公开验证。live JSON 仍可能包含模型返回第一行摘要；公开 issue、PR、知识库或交接材料只记录 `summary`、provider 名称和状态，不记录完整请求、响应、API key、账号信息或平台原始内容。

## 后续

Provider Live GitHub workflow 后续可复用该报告结构，把真实调用验收结果整理成不含密钥的状态摘要。
