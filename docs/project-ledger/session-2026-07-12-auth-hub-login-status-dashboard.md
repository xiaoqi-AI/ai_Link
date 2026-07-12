# 2026-07-12 Auth Hub 授权/登录状态看板

## 背景

用户确认 PR #11 已合并，并追问 Auth Hub 远程化是否能减少 GitHub、公众号、小红书等平台反复要求人工登录验证的问题。本轮目标不是远程部署 Auth Hub，也不是接入真实平台账号，而是在现有 local-first Auth Hub 基础上补齐项目负责人视角的状态入口：哪些平台可用，哪些需要本机续登、验证码、凭据配置或连接器维护。

## 边界

- 不读取 Cookie、Profile、token、二维码、截图、账号详情、原始平台响应或本机私有路径。
- 不新增真实小红书、公众号、GitHub 登录自动化。
- 不改变已有 connector 合同、任务执行器和审批边界。
- 只使用公开安全的 connector registry、稳定错误码和已脱敏 `action_required` 任务。

## 实现

- 新增 `src/connectors/authStatus.js`，根据 connector 状态和 `action_required` 任务生成 `authStatus`。
- 新增只读 API `GET /api/auth-status`，复用 `connectors:read` 权限。
- 控制台首页和 `/dashboard/connectors` 新增“授权/登录关注项”表格。
- `needs_action`、`ready`、`blocked` 状态补齐页面样式。
- 测试覆盖 API、控制台页面、权限边界和敏感字段不泄露。

## 验证

- `npm.cmd run check` 通过。
- `node --test tests/task-flow.test.js` 通过，15/15。

## 影响

其他项目后续不需要直接询问“AI Link 现在能不能用某个平台账号”。它们可以：

1. 读取 `GET /api/auth-status` 判断是否有 `needs_action`。
2. 如果需要人工处理，提示维护者进入 Auth Hub 控制台对应任务。
3. 维护者完成续登、验证码或凭据配置后，在 Auth Hub 中 retry。
4. 任务恢复后，其他项目继续调用 AI Link 能力。

该能力降低了重复人工确认成本，但不消灭平台自身的验证码、风控、登录过期和权限变更。
