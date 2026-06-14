# 2026-06-15 Auth Hub Audit Page

## 变更

- 控制台新增 `/dashboard/audit` 审计日志页。
- 顶部导航新增“审计”入口。
- 审计页支持按 `taskId`、`eventType` 和 `limit` 筛选。
- `ai_link.audit` 事件会在审计页汇总为 provider、model、policy、审批、预算和 usage estimate 表格。
- UI route 使用 `publicAuditEvent`，避免旧事件或异常 detail 绕过白名单脱敏。

## 安全边界

- 页面只展示脱敏后的审计事件。
- AI Link audit 摘要只展示服务端规范化后的白名单字段。
- 不展示原始 input、原始 output、API key、token、Cookie、登录态或截图。

## 验证

- `npm run auth-hub:test`
- `npm test`
- `npm run security:scan`

## 下一步

- 给审计页增加时间窗口筛选。
- 为远端生产 smoke 增加 audit page 可访问性检查。
