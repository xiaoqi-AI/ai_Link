# 2026-06-15 Outbound Policy Enforcement

## 本次变化

- `allowOutbound` 开始参与真实执行判定。
- 非 dry-run 的非 `mock` provider 调用会被视为外部出站。
- `allowOutbound: never` 会阻断真实外部 provider 调用，即使传入审批参数也不会放行。
- `allowOutbound: user-approved` 要求真实外部调用显式批准：`run` 使用 `--approve-policy`，`workflow run` 使用 `--approve-stage <stage>` 或 `--approve-all`。
- `providers verify --live` 作为专门验收入口，会把 live 验收动作视为已批准，但仍保留 BWS / key / endpoint 检查。

## 安全边界

- dry-run 不触发真实出站，只展示审批提示。
- mock/local provider 不视为外部出站。
- 敏感内容扫描仍然独立生效；即使 `allowOutbound: always`，也不会自动绕过 `blockSensitive`。
- BWS 只负责临时注入密钥；`allowOutbound` 和 approval 负责是否允许真实外部调用。

## 后续建议

- 在 policy 中继续增加费用上限、provider 类型白名单、审计标签和数据分类。
- 后续可把 `allowOutbound` 的批准记录对接授权中枢控制台，形成可审计审批流。
