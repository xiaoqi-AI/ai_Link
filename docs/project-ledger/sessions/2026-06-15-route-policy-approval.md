# 2026-06-15 Route Policy Approval

## 本次变化

- 将 `auto_ops.agent_flow` 的真实执行确认从单个 workflow stage 下沉到 `external_action` policy。
- `ai-link run` 新增 `--approve-policy` / `--approve`，直接调用高风险 route 时也必须显式批准。
- `workflow run` 继续复用 `--approve-stage <stage>` / `--approve-all`，并把批准状态传给 route policy。
- 配置校验新增 policy `approval.mode` 检查。

## 安全边界

- BWS 负责临时注入密钥；policy approval 负责在密钥可用后继续保留人工确认。
- `live` 模式下 dry-run 只提示审批状态，不触发真实外部动作。
- 审批状态只记录模式、是否批准和原因，不包含 token、API key 或登录态。

## 下一步

- 后续可把 `external_action` policy 与授权中枢控制台审批流打通。
- 发布、写入外部系统或可能产生费用的 route，可继续评估默认使用 `approval.mode: always`。
