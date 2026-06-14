# 2026-06-15 Audit Event Filter And Table

## 变更

- `GET /api/audit` 新增 `eventType` 查询参数，可只读取 `ai_link.audit` 等特定审计事件。
- 内存存储和 Postgres 存储统一支持按 `eventType` 过滤审计日志。
- 控制台任务详情新增 AI Link 审计摘要表格，集中展示 provider、model、policy、审批、预算和 usage estimate。
- 新增 UI HTML 测试，确认表格可渲染并且不会展示未白名单字段。

## 安全边界

- 审计表格只使用服务端已规范化的 AI Link audit 摘要。
- 不展示原始 input、原始 output、API key、token、Cookie、登录态或截图。
- `GET /api/audit` 仍需要 `audit:read` scope。

## 验证

- `npm run auth-hub:test`
- `npm run check`
- `npm run security:scan`

## 下一步

- 给控制台增加独立审计日志页，支持按 task、event type 和时间窗口筛选。
- 在本地 auth-hub 实跑 `runs submit-audit` 闭环后，把推荐操作固化到示例脚本。
