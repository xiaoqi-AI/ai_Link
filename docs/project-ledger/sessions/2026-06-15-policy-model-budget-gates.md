# 2026-06-15 Policy 模型与预算门禁

## 变更

- policy 新增 `allowedModels` 和 `blockedModels`，用于按模型名或通配模式限制 route 可用模型。
- policy 新增 `budget`，当前支持 `maxInputChars`、`maxInputTokens`、`maxOutputTokens` 和 `maxEstimatedCostUsd`。
- provider 新增可选 `pricing.inputUsdPer1M` 和 `pricing.outputUsdPer1M`，用于执行前成本估算。
- 运行结果 metadata 会暴露 `policyBudget` 和 `usageEstimate`，便于后续接入授权中枢、日志或审计报表。
- 本地 run record 新增 `audit` 摘要，记录 provider type、policy、预算、使用量估算和审批状态，但不保存原始输入。
- 默认公开配置为常用外部 provider 增加 `requestDefaults.max_tokens`，让预算估算有稳定输出上限。

## 安全边界

- 预算估算是执行前保护和审计辅助，不等同于供应商最终账单。
- provider type gate 仍先于模型和预算门禁执行；外部动作 route 会先判断是否允许该 provider 类型。
- BWS 负责临时注入密钥，policy 继续负责“密钥可用后是否允许调用、调用哪个模型、预算是否超界”。

## 验证

- `npm test`
- `npm run bws:acceptance:print`
- `npm run security:scan`
