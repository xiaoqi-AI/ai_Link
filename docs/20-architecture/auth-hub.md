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
```

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
- `POST /api/tasks/:id/approve`：确认或拒绝发布等高风险动作。
- `POST /api/tasks/:id/retry`：人工处理完成后，把 `action_required` 或失败任务重新排队。
- `POST /api/tasks/:id/audit`：Codex 追加 AI Link run record 审计摘要，不改变任务状态。
- `POST /api/executor/lease`：本地执行器领取任务。
- `POST /api/executor/tasks/:id/result`：本地执行器回传完成、失败、待人工处理或待审批结果。
- `GET /api/audit`：读取审计日志，支持 `taskId`、`eventType` 和 `limit` 查询参数。

执行器回传结果时可以带顶层 `audit` 字段，或在 `result.audit` / `result.aiLinkAudit` 中带 AI Link 审计摘要。服务端会按白名单规范化为 `task.result.aiLinkAudit`，同时追加一条 `ai_link.audit` 审计事件。Codex 也可以通过 `POST /api/tasks/:id/audit` 或 `npm run ai-link -- runs submit-audit latest --task-id <auth-hub-task-id>` 把本地 run record 的审计摘要追加到任务审计日志。控制台任务详情会把 AI Link 审计摘要渲染为 provider/model/policy/预算/用量表格，`GET /api/audit?eventType=ai_link.audit` 可只读取这类事件。该摘要只保留 provider、model、policy、审批状态、数据分类、审计标签、预算和 usage estimate，不保存原始输入、原始输出、密钥或 token。

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
npm run auth-hub:remote:smoke
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
- 连接器契约：微信、朱雀AI和预留平台会输出统一的能力状态，供 API 和控制台只读展示。
- Codex token 无法执行审批。
- 敏感字段和原始内容脱敏。
