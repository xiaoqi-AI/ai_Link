# 2026-06-15 Workflow 阶段审批门

## 本次变化

- workflow stage 支持 `approval.required`、`approval.mode` 和 `approval.reason`。
- 默认 `auto_ops.agent_flow` 增加 live 审批门，真实运行前必须显式 `--approve-stage agent_flow` 或 `--approve-all`。
- dry-run 不阻断 live 审批门，但会在结果中标记审批状态。
- 运行记录和 `runs show` 会保留阶段审批状态，方便复盘。

## 安全边界

- 审批门用于真实外部工具、平台自动化、费用相关调用或发布类动作。
- 审批状态不是密钥，不包含 token 或登录态。
- BWS 只负责临时注入凭据；审批门负责在凭据可用后继续保留人工确认。

## 下一步

- 后续可把审批门和授权中枢控制台审批流打通。
- 可继续评估 `approval.mode: always` 在发布、写入外部系统等场景的默认模板。
