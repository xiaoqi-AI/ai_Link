# 统一授权中枢 MVP

状态：公开骨架已实现，真实平台连接器仍需私有配置和人工授权。

## 目标

统一授权中枢用于承接跨平台内容运营流程：Codex 创建任务，本地执行器用受控登录态访问平台，控制台展示脱敏结果，并在发布等高风险动作前请求人工确认。

第一版覆盖：

- Render Node.js Web Service 控制台和 API。
- Cloudflare Access 前置门禁加应用内登录。
- Render Postgres 任务、审批、审计和 API token 存储。
- 当前电脑本地执行器。
- mock 微信/朱雀AI连接器，跑通全链路。
- 抖音、小红书、知乎、头条连接器占位。

## 运行方式

本地试跑：

```powershell
npm install
npm run auth-hub:local:start
```

执行一次端到端烟测：

```powershell
npm run auth-hub:smoke
npm run auth-hub:audit-smoke
```

`auth-hub:smoke` 验证任务创建、执行器领取、审批和完成状态；`auth-hub:audit-smoke` 验证 Codex / AI Link 本地 run record 审计回传：创建测试任务、运行 `workflow run --record`、调用 `runs submit-audit`，并确认 `GET /api/audit?eventType=ai_link.audit` 可查到脱敏后的 Grok dry-run 审计摘要。

启动常驻本地执行器：

```powershell
npm run auth-hub:executor:start
```

停止本地执行器和控制台：

```powershell
npm run auth-hub:executor:stop
npm run auth-hub:local:stop
```

开发默认值只适合本机试跑：

- 控制台密码：`dev-password`
- 管理 API token：`dev-admin-token`
- 执行器 API token：`dev-executor-token`
- Codex API token：`dev-codex-token`

公网、Render 或团队环境必须通过环境变量替换为强随机值。

本地运行状态写入 `runtime/tmp/`：

- `auth-hub-local.json`：本地控制台进程、端口和日志。
- `auth-hub-executor-process.json`：本地执行器进程和日志。
- `auth-hub-executor.json`：执行器最近一次轮询、任务和错误状态。

## API 契约

- `POST /api/tasks`：创建任务，支持 `full_chain`、`read_detect`、`draft_only`、`metrics`。
- `GET /api/tasks`：读取脱敏任务列表，可用 `status` 查询参数筛选。
- `GET /api/tasks/:id`：读取脱敏任务状态。
- `GET /api/connectors`：用 `connectors:read` 权限读取公开安全的连接器状态和能力契约，不返回密钥、Cookie、登录态或平台内容。
- `POST /api/tasks/:id/approve`：确认或拒绝发布、交互登录等高风险或人工协助动作。
- `POST /api/tasks/:id/retry`：人工处理完成后，把 `action_required` 或失败任务重新排队。
- `POST /api/tasks/:id/audit`：Codex 追加 AI Link run record 审计摘要，不改变任务状态。
- `POST /api/executor/lease`：本地执行器领取任务。
- `POST /api/executor/tasks/:id/result`：本地执行器回传完成、失败、待人工处理或待审批结果。
- `GET /api/audit`：读取审计日志，支持 `taskId`、`eventType` 和 `limit` 查询参数。

执行器回传结果时可以带顶层 `audit` 字段，或在 `result.audit` / `result.aiLinkAudit` 中带 AI Link 审计摘要。服务端会按白名单规范化为 `task.result.aiLinkAudit`，同时追加一条 `ai_link.audit` 审计事件。Codex 也可以通过 `POST /api/tasks/:id/audit` 或 `npm run ai-link -- runs submit-audit latest --task-id <auth-hub-task-id>` 把本地 run record 的审计摘要追加到任务审计日志。控制台任务详情和 `/dashboard/audit` 会把 AI Link 审计摘要渲染为 provider/model/policy/预算/用量表格，审计页支持按 task id、event type 和数量筛选；`GET /api/audit?eventType=ai_link.audit` 可只读取这类事件。本地可用 `npm run auth-hub:audit-smoke` 验证 dry-run record、审计提交和脱敏读取整条链路。该摘要只保留 provider、model、policy、审批状态、数据分类、审计标签、预算和 usage estimate，不保存原始输入、原始输出、密钥或 token。

所有 API 使用 Bearer token；token 只以哈希形式入库。

## 数据与安全边界

- 公开仓只保存代码、文档、mock 连接器和 `.env.example`。
- 真实 `.env`、API key、Cookie、浏览器 Profile、二维码、登录态、截图和平台原始内容不进入 Git。
- 高价值账号的浏览器 Profile 放在本机 `runtime/private/`。
- Render 暂不保存浏览器登录态；若未来使用持久盘，必须重新评估加密、备份和删除策略。
- 邮件提醒只包含任务 ID、审批 ID、摘要和控制台链接，不包含原文、截图、Cookie、token 或账号细节。
- 发布策略固定为每次确认发布：系统可自动创建草稿摘要，但正式发布必须通过控制台或 API 审批。

## 部署默认值

`render.yaml` 提供 Render Web Service 和 Postgres 的部署骨架。生产环境至少需要：

- `AI_LINK_BASE_URL`
- `DATABASE_URL`
- `AI_LINK_APP_PASSWORD`
- `AI_LINK_SESSION_SECRET`
- `AI_LINK_ADMIN_TOKEN`
- `AI_LINK_EXECUTOR_TOKEN`
- `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS=true`
- `AI_LINK_ALLOWED_ACCESS_EMAILS`
- `AI_LINK_CLOUDFLARE_ACCESS_AUD`
- `AI_LINK_CLOUDFLARE_TEAM_DOMAIN` 或 `AI_LINK_CLOUDFLARE_ACCESS_ISSUER`
- 可选：`AI_LINK_CODEX_TOKEN`
- 可选：`SMTP_URL`、`APPROVAL_EMAIL_TO`、`APPROVAL_EMAIL_FROM`

Cloudflare Access 应限制 `voice.xiao-qi-ai.com` 只能由授权邮箱访问；应用自身还会通过 `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS` 校验 Access header/JWT，应用内登录作为第二层门禁。

部署前检查见 `docs/20-architecture/auth-hub-deployment-checklist.md`。

生成生产随机密钥时只输出到当前终端，不写入文件：

```powershell
npm run auth-hub:secrets:new
```

部署前本地预检：

```powershell
npm run auth-hub:deploy:check
```

远端部署后验收：

```powershell
npm run auth-hub:remote:next
npm run auth-hub:remote:smoke
```

`auth-hub:remote:smoke` 默认使用 `full_chain` mock 流程验证远端闭环：健康检查、Cloudflare Access/应用内登录、任务创建、连接器状态、受限 Codex token 读取边界、本地执行器领取任务、发布前审批、审批后再次执行、脱敏任务详情和审计日志。它不会接入真实微信、朱雀AI或其他平台账号。
`auth-hub:remote:next` 是更轻量的 go/no-go 检查，只读取 `/healthz`、公开 `render.yaml` 和当前进程环境变量是否存在，不打印任何 secret 值；它会告诉维护者下一步应先修域名/Render、补 secret，还是可以进入 `auth-hub:remote:smoke`。

生产验收时建议在当前终端临时注入真实值，值本身不要写入文件或聊天记录：

```powershell
$env:AI_LINK_BASE_URL="https://voice.xiao-qi-ai.com"
$env:AI_LINK_ADMIN_TOKEN="<admin-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
$env:AI_LINK_CODEX_TOKEN="<codex-token-from-secret-store>"
$env:AI_LINK_APP_PASSWORD="<app-password-from-secret-store>"
$env:CF_ACCESS_CLIENT_ID="<cloudflare-service-auth-client-id>"
$env:CF_ACCESS_CLIENT_SECRET="<cloudflare-service-auth-client-secret>"
npm run auth-hub:remote:smoke
```

如果要同时确认未授权浏览器会被 Cloudflare Access 拦截，直接调用脚本并加 `-ExpectAccessGate`。该检查会故意不带 Access 头访问 `/login`，期望收到跳转、401 或 403：

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -ExpectAccessGate
```

若外部账号、DNS、Render、Postgres、Cloudflare Access 或 secret 尚未配置完成，远端 smoke 只能作为待验收项；此时可继续用本地控制台加同一脚本验证 mock 链路：

```powershell
npm run auth-hub:local:start
powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -BaseUrl "http://127.0.0.1:10001" -AdminToken "dev-admin-token" -ExecutorToken "dev-executor-token" -CodexToken "dev-codex-token" -AppPassword "dev-password"
npm run auth-hub:local:stop
```

## 测试

```powershell
npm test
npm run security:scan
npm audit --audit-level=high
```

测试覆盖：

- 原有 AI Link CLI 路由和 provider 行为。
- 授权中枢 mock 全链路：创建任务、执行器领取、检测和草稿摘要、审批、发布完成。
- 待人工处理状态：执行器可回传 `needs_action`，控制台会单独列出 `action_required` 任务，管理员处理后可 retry 重新排队。
- 待人工审批状态：执行器可回传 `needs_approval`，控制台会创建 `approval_required` 任务；`platform_interactive_login` 审批通过后，才允许本机执行器进入交互式登录步骤。
- 连接器契约：微信、朱雀AI和预留平台会输出统一的能力状态，供 API 和控制台只读展示。
- Codex token 无法执行审批。
- 敏感字段和原始内容脱敏。

## 授权/登录状态看板

Auth Hub 控制台在任务首页和 `/dashboard/connectors` 提供“授权/登录关注项”摘要，用于项目负责人快速判断哪些平台当前可用，哪些需要本机续登、验证码、凭据配置或连接器维护。

该摘要只读取公开安全信息：

- connector registry 中的平台、状态、模式、能力和稳定问题代码。
- `action_required` 与 `approval_required` 任务中的公开错误码、平台名和任务 ID。
- 已脱敏的任务摘要。

该摘要不会读取或展示 Cookie、浏览器 Profile、refresh token、access token、二维码、截图、账号详情、原始平台响应或本机私有路径。真实登录态仍只保存在本机私有边界内，由私有 connector 或本地执行器负责。

机器读取入口：

```text
GET /api/auth-status
Authorization: Bearer <token with connectors:read>
```

返回内容包含 `connectors`、`issues` 和 `authStatus`。`authStatus.summary` 给出 `ready`、`needs_action`、`reserved`、`blocked` 计数；`authStatus.items` 按平台给出状态、处理建议、公开原因码和最多 5 个关联任务 ID。

状态口径：

- `ready`：公开能力契约可用，当前没有相关人工处理任务。
- `needs_action`：已有关联 `action_required` 或 `approval_required` 任务，例如 `login_expired`、`captcha_required`、`credential_missing`、`interactive_approval_required`。
- `reserved`：公开仓仅预留合同位，暂未接入真实账号。
- `blocked`：connector 契约缺失或配置异常，需要维护者修复。

该入口的目标不是替代真实平台会话探测，而是把“已经被执行器发现、已经脱敏、需要人处理或批准”的事项集中展示。其他项目可以读取该接口决定是否暂停自动化、提示维护者或等待 AI Link 本地执行器完成续登后重试。
