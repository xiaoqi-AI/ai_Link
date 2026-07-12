# 2026-07-12 Auth Hub 授权行动清单

## 背景

AI Link 的 Auth Hub 已能展示连接器状态，并通过 `/api/auth-status` 汇总 `action_required` 与 `approval_required` 任务。项目负责人视角还需要更直接的“下一步做什么”：例如找账号负责人续登、找维护者批准本机交互登录、找密钥负责人补齐凭据，或找连接器维护者修复私有合同。

这项能力同时支撑：

- 模块 2：Auth Hub 状态中枢，提供可读、可审计的授权/登录关注项。
- 模块 5：平台授权连接器 P0.2，把小红书、公众号、GitHub 等真实平台的人工门禁统一成公开安全行动。
- 模块 6：Auth Hub 远程化，让远程后台和外部项目只消费脱敏状态与行动清单，不接触真实登录态。

## 本次增量

- `/api/auth-status` 的 `authStatus.summary` 新增 `next_actions`。
- `/api/auth-status` 的 `authStatus` 新增 `nextActions[]`。
- 每条行动包含：
  - `platform`
  - `reason`
  - `title`
  - `owner`
  - `severity`
  - `runbook`
  - `relatedTaskIds`
  - `retryAfterAction`
- `/dashboard` 与 `/dashboard/connectors` 新增“下一步行动”表。
- 文档补充 `nextActions` 合同，明确外部项目只能把它作为暂停、提醒和人工门禁信号。

## 安全边界

- 不读取、不保存、不展示 Cookie、Profile、token、二维码、截图、账号详情、原始响应或本机私有路径。
- 不新增真实平台调用。
- 不改变私有连接器加载边界。
- `interactive_approval_required` 仍必须先进入人工审批，审批通过后才允许本地执行器调用受信任私有连接器的交互登录流程。

## 验收重点

- API 能返回行动负责人、严重性、处理说明和关联任务。
- 控制台能显示“下一步行动”。
- 交互登录审批不会被误标为可直接 retry。
- 登录过期类问题会指向账号负责人，并标记为人工处理后可 retry。
- 敏感字段仍被脱敏。
