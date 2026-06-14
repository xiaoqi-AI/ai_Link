# 2026-06-15 Auth Hub 待人工处理与重试

## 本次推进

- 执行器将登录过期、验证码、平台限流、会话失效等错误归类为 `needs_action`。
- API 新增 `POST /api/tasks/:id/retry`，人工处理后可重新排队。
- 任务状态新增 `action_required`，控制台展示待处理事项并提供重试表单。
- MemoryStore 和 PostgresStore 同步支持 `markTaskNeedsAction` 与 `retryTask`。
- 测试覆盖执行器回传 `needs_action`、Codex token 不能 retry、管理员 retry 重新排队、连接器登录过期分类。

## 安全边界

- 待处理事项只记录脱敏后的错误摘要和下一步建议。
- 真实登录态、验证码、二维码、Cookie、浏览器 Profile 和平台截图仍只能留在本机私有边界或私有仓治理材料中。
- 重试权限沿用 `tasks:approve`，避免低权限 token 重新触发高风险任务。

## 后续建议

- 给失败类型增加更细的前端筛选和运维统计。
- 远端生产 smoke 可增加 action-required roundtrip，用于验证 Cloudflare Access + 本地执行器的人工处理链路。
