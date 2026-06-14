# 2026-06-15 Auth Hub AI Link Audit

## 变更

- 执行器结果回传接口 `POST /api/executor/tasks/:id/result` 支持顶层 `audit`、`result.audit` 和 `result.aiLinkAudit`。
- 服务端把 AI Link audit 摘要规范化后写入 `task.result.aiLinkAudit`。
- 服务端追加 `ai_link.audit` 审计事件，可通过任务详情和 `GET /api/audit` 查询。
- 新增 `POST /api/tasks/:id/audit`，允许 Codex 只追加 AI Link 审计摘要，不改变 task 状态。
- CLI 新增 `ai-link runs submit-audit <id|latest> --task-id <auth-hub-task-id>`，可把本地 run record 顶层 `audit` 追加到授权中枢。
- 控制台任务详情页新增 `AI Link Audit` 区块。
- 新增白名单规范化模块 `src/audit/aiLinkAudit.js`，只保留 provider、model、policy、审批、数据分类、审计标签、预算和 usage estimate。

## 安全边界

- 不保存原始 input、原始 output、密钥、token、Cookie、登录态或截图。
- `result.audit` / `result.aiLinkAudit` 不作为普通 result 字段原样保存，会被抽取为规范化后的 `aiLinkAudit`。
- 通用脱敏规则仍然保留；只有 `ai_link.audit` 事件和规范化后的 `task.result.aiLinkAudit` 会保留 token 计数字段。

## 验证

- `npm run auth-hub:test`
- `npm run check`
- `npm run security:scan`

## 下一步

- 让真实 AI Link workflow handoff 或本地 executor 自动把 CLI `--record` audit 摘要回传到授权中枢。
- 给控制台增加更易扫描的 provider/model/policy 表格。
- 为 `GET /api/audit` 增加 event type 筛选。
