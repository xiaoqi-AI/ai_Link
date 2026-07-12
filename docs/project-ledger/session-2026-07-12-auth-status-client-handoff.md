# 2026-07-12 Auth Hub 状态只读客户端交接

## 背景

PR #16 合并后，Auth Hub 的 `/api/auth-status` 已能返回 `nextActions`，但 ParentingGame、Hermes Agent 等项目还需要一个低成本、可复用的消费入口，避免每个项目自己写请求、字段过滤和脱敏判断。

## 本次增量

- 新增 `tools/show-auth-status-next-actions.js`。
- 新增命令：
  - `npm run auth-hub:status`
  - `npm run auth-hub:status:json`
  - `npm run auth-hub:status:strict`
- 命令读取：
  - `AI_LINK_BASE_URL`
  - `AI_LINK_CODEX_TOKEN` 或 `AI_LINK_ADMIN_TOKEN`
  - 可选 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`
- 命令只调用 `GET /api/auth-status`，输出公开安全的 `summary`、`authStatus.items` 和 `nextActions`。

## 给其他项目的配置口径

其他项目如果需要知道是否能继续自动化，只需要配置：

```powershell
$env:AI_LINK_BASE_URL="https://voice.xiao-qi-ai.com"
$env:AI_LINK_CODEX_TOKEN="<read-only-codex-token>"
npm run auth-hub:status:json
```

处理规则：

- `nextActions` 为空：相关平台授权状态无需人工处理，项目可以继续正常自动化。
- `severity=manual`：暂停相关平台任务，找 `owner` 对应负责人处理，处理后按 `retryAfterAction` 决定是否 retry。
- `severity=approval`：需要维护者先在 Auth Hub 审批，不能由业务项目直接触发本机交互登录。
- `severity=blocked`：先修 AI Link/平台授权/连接器合同，不要在业务项目里盲目重试。

## 安全边界

- 不输出 API token、Cloudflare service token、Cookie、Profile、二维码、截图、账号详情、原始平台响应或 `runtime/private` 路径。
- 不新增真实平台调用。
- 不改变 Auth Hub 审批门。
- 这是跨项目状态消费入口，不是小红书、公众号或 GitHub 的真实 connector 实现。
