# 2026-06-15 Policy Provider Gates

## 本次变化

- `PolicyConfig` 新增 `allowedProviderTypes`、`blockedProviderTypes`、`auditTags` 和 `dataClass`。
- router 会在执行 provider 前检查 provider type 是否符合 policy。
- 不符合 policy 的候选 provider 会被记录为失败尝试；如果是用户用 `--provider` 显式指定的 provider，会直接报错。
- `RunResult.metadata` 会保留 policy 名称、provider type、`allowOutbound`、`policyAuditTags` 和 `policyDataClass`。
- 默认 `external_action` policy 限制为 `coze` / `mock`，防止 agent workflow route 被临时改派到普通文本模型。

## 安全边界

- `mock` 仍可作为本地 fallback，用于公开仓 dry-run 和无 key 试跑。
- provider type gate 不替代 BWS、出站审批或敏感内容扫描；它只回答“这类 route 是否允许这种 provider 执行”。
- `auditTags` 和 `dataClass` 是非密钥 metadata，可用于后续授权中枢、日志或报告。

## 后续建议

- 下一步可在 policy 中加入费用上限、单次调用预算和模型级白名单。
- 后续可把 `policyAuditTags` 写入 auth-hub 审计事件，形成跨 CLI / 控制台的一致审计链。
