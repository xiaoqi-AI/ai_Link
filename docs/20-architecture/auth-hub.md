# 统一授权中枢 MVP

状态：公开骨架、执行器能力心跳和显式只读探测证据闭环已实现；真实账号探测与远程部署仍需独立人工门禁。

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
- `POST /api/executor/heartbeat`：本地执行器上报严格白名单化的能力快照，由服务端写入接收时间和过期时间。
- `POST /api/executor/lease`：本地执行器领取任务。
- `POST /api/executor/tasks/:id/result`：本地执行器回传完成、失败、待人工处理或待审批结果。
- `GET /api/audit`：读取审计日志，支持 `taskId`、`eventType` 和 `limit` 查询参数。

执行器回传结果时可以带顶层 `audit` 字段，或在 `result.audit` / `result.aiLinkAudit` 中带 AI Link 审计摘要。服务端会按白名单规范化为 `task.result.aiLinkAudit`，同时追加一条 `ai_link.audit` 审计事件。Codex 也可以通过 `POST /api/tasks/:id/audit` 或 `npm run ai-link -- runs submit-audit latest --task-id <auth-hub-task-id>` 把本地 run record 的审计摘要追加到任务审计日志。控制台任务详情和 `/dashboard/audit` 会把 AI Link 审计摘要渲染为 provider/model/policy/预算/用量表格，审计页支持按 task id、event type 和数量筛选；`GET /api/audit?eventType=ai_link.audit` 可只读取这类事件。本地可用 `npm run auth-hub:audit-smoke` 验证 dry-run record、审计提交和脱敏读取整条链路。该摘要只保留 provider、model、policy、审批状态、数据分类、审计标签、预算和 usage estimate，不保存原始输入、原始输出、密钥或 token。

所有 API 使用 Bearer token；token 只以哈希形式入库。

## 三层状态证据

Auth Hub 把连接器状态拆成三个互不替代的层次：

1. `contract`：服务端公开 registry 的静态合同，只说明平台和方法在当前版本中被声明为已实现、预留或异常。
2. `executor`：本地执行器心跳，只说明某个执行器进程在线，并且启动时加载了哪些方法和 capability mode。
3. `probe`：绑定执行器身份、进程会话和一次性租约的显式只读健康探测，例如 `checkSession`、`checkHealth` 或 `checkAuth`。它不会由状态页、定时刷新或普通任务自动触发。

`GET /api/connectors` 顶层 `connectors` 与 `issues` 保留服务端静态合同；`executorRuntime` 单独返回执行器证据、在线/过期计数和合并后的平台视图。没有新鲜执行器心跳时，不能用静态合同补成在线；没有新鲜成功探测时，`operationalStatus` 必须为 `unverified`，`canRunReal` 必须为 `false`。即使 `canRunReal=true`，它也只适用于 `verifiedOperations` 中列出的健康操作，不代表整个平台、写权限或发布能力可用。

执行器心跳是 best-effort：它在每轮 lease 前发送，失败不会阻塞普通任务领取，也不会调用任何 connector 方法。心跳只允许 schema version、受限 executor id、进程级随机 session id、平台、合同状态、模式、能力名、可用布尔值、capability mode 和稳定问题码；拒绝额外字段。服务端只保留每个 executor id 的最新快照，并用服务端时间设置 TTL。

显式 probe 使用更严格的可信链：生产环境把 `AI_LINK_EXECUTOR_TOKEN` 绑定到 `AI_LINK_EXECUTOR_ID`；执行器每次启动生成新的 session id；服务端仅把 probe 任务租给同一身份、同一在线 session 且已报告目标 private capability 的执行器，并签发一次性 `leaseId`。结果必须在租约过期前由相同身份和 session 回传，Hub 再按任务原始 platform/operation 重新规范化结果，并在同一存储事务中结算任务、写入最新证据和审计。重复提交、旧租约、错误 session、mock 心跳和未绑定 token 都不能刷新证据。

首批允许生成证据的操作只有：`xiaohongshu/check_session`、`wechat_official/check_health`、`github/check_auth`。`begin_login`、`search_content`、普通 `platform_auth_collect` 任务、mock 远端烟测和历史任务均不会生成证据。证据只保存平台、操作、公开结论、公开问题码、任务 ID 和服务端有效期；内部租约、session/revision、客户端时间、结果载荷、账号信息与原始响应不进入 API 或 UI。默认 TTL 为 15 分钟；最新失败覆盖同操作旧成功，过期后不会回退到更旧成功。

创建显式 probe 的请求示例：

```json
{
  "workflow": "platform_auth_collect",
  "input": {
    "platform": "github",
    "operation": "check_auth",
    "scope": "repo_read"
  },
  "options": {
    "evidenceIntent": "connector_probe"
  }
}
```

创建 probe 任务要求调用方同时具有 `tasks:create` 和管理端已有的 `tasks:approve` scope；默认受限 Codex token 会收到 `connector_probe_approval_required`。只有任务被绑定执行器领取时才调用对应私有只读方法；任何登录、验证码、费用、限流或写操作仍按原人工门禁停止。

## 数据与安全边界

- 公开仓只保存代码、文档、mock 连接器和 `.env.example`。
- 真实 `.env`、API key、Cookie、浏览器 Profile、二维码、登录态、截图和平台原始内容不进入 Git。
- 高价值账号的浏览器 Profile 放在本机 `runtime/private/`。
- Render 暂不保存浏览器登录态；若未来使用持久盘，必须重新评估加密、备份和删除策略。
- 执行器心跳不包含 hostname、用户名、模块路径、Cookie、token、Profile、账号详情或原始平台响应，也不保存历史快照流水。
- 邮件提醒只包含任务 ID、审批 ID、摘要和控制台链接，不包含原文、截图、Cookie、token 或账号细节。
- 发布策略固定为每次确认发布：系统可自动创建草稿摘要，但正式发布必须通过控制台或 API 审批。

## 部署默认值

`render.yaml` 提供 Render Web Service 和 Postgres 的部署骨架。生产环境至少需要：

- `AI_LINK_BASE_URL`
- `DATABASE_URL`
- `AI_LINK_APP_PASSWORD`
- `AI_LINK_SESSION_SECRET`
- `AI_LINK_SESSION_MAX_AGE_SECONDS`，默认 `28800`，允许范围为 5 分钟至 24 小时
- `AI_LINK_ADMIN_TOKEN`
- `AI_LINK_EXECUTOR_TOKEN`
- `AI_LINK_EXECUTOR_ID`，必须与本地执行器使用的 ID 一致
- `AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS`，默认 `60000`，允许范围为 15 秒至 10 分钟
- `AI_LINK_CONNECTOR_PROBE_TTL_MS`，默认 `900000`，允许范围为 1 分钟至 24 小时
- `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS=true`
- `AI_LINK_ALLOWED_ACCESS_EMAILS`
- `AI_LINK_CLOUDFLARE_ACCESS_AUD`
- `AI_LINK_CLOUDFLARE_TEAM_DOMAIN` 或 `AI_LINK_CLOUDFLARE_ACCESS_ISSUER`
- 可选：`AI_LINK_CODEX_TOKEN`
- 可选：`SMTP_URL`、`APPROVAL_EMAIL_TO`、`APPROVAL_EMAIL_FROM`

生产模式缺少 `DATABASE_URL` 会在配置加载阶段拒绝启动，不允许退回 `MemoryStore`。公开蓝图中的数据库使用当前可新建的 `basic-256mb` 规格并设置 `ipAllowList: []`，只允许 Render 私网连接；Web Service 使用 `autoDeployTrigger: checksPass`。`AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN` 使用 `sync: false`，必须由部署负责人明确选择，不能因模板默认值静默开放。Render service 与数据库 region 创建后不可修改，蓝图暂不替负责人选择，部署前必须确认。

Render 官方参考：[Blueprint YAML Reference](https://render.com/docs/blueprint-spec)、[Render Postgres flexible plans](https://render.com/docs/postgresql-refresh)。

Cloudflare Access 应限制独立 Auth Hub 域名只能由授权邮箱访问；应用自身还会通过 `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS` 校验 Access JWT 的 RS256 签名、issuer 和 audience。用户身份只取已验证 JWT 的 `email`，若转发邮件头存在则必须与 JWT 一致；服务令牌只接受已验证 JWT 的 `common_name`，且必须显式开启 service-token 访问。任何 JWT 校验参数缺失、身份不一致或签名失败都会拒绝请求，不退化为信任请求头。应用内登录作为第二层门禁，其签名会话包含服务端校验的绝对过期时间，默认 8 小时。当前 `voice.xiao-qi-ai.com` 承载的不是 Auth Hub，不应覆盖；建议候选为 `auth.xiao-qi-ai.com`，最终域名仍需负责人确认。

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

`auth-hub:remote:smoke` 默认使用 `full_chain` mock 流程验证远端闭环：健康检查、Cloudflare Access/应用内登录、任务创建、连接器状态、执行器在线心跳、受限 Codex token 读取边界、本地执行器领取任务、发布前审批、审批后再次执行、脱敏任务详情和审计日志。应用密码、Admin token 和受限 Codex token 缺失会直接失败；Executor token 只有在显式 `-SkipExecutor` 时可省略。脚本会在 smoke 进程中显式清除 `AI_LINK_PRIVATE_CONNECTOR_MODULE`，确保不接入真实微信、小红书、公众号、GitHub 或其他平台账号。
`auth-hub:remote:next` 是更轻量的 go/no-go 检查，只读取 `/healthz`、公开 `render.yaml` 和当前进程环境变量是否存在，不打印任何 secret 值；它会告诉维护者下一步应先修域名/Render、补 secret，还是可以进入 `auth-hub:remote:smoke`。

生产验收时建议在当前终端临时注入真实值，值本身不要写入文件或聊天记录：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前确认
$env:AI_LINK_ADMIN_TOKEN="<admin-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_ID="local-executor"
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
- 执行器心跳：严格字段白名单、TTL 过期、缺失/过期失败关闭、旧版 Hub 兼容和心跳失败不阻塞 lease。
- 显式 probe：token/executor/session/lease 全链绑定、mock 不可领取、服务端重验、结果重放拒绝、最新失败覆盖、TTL 失败关闭和敏感内部字段不外泄。
- 远程访问：Access JWT 签名/issuer/audience 校验、邮件身份绑定、服务令牌分类、缺失配置失败关闭，以及控制台会话服务端绝对过期。
- Codex token 无法执行审批。
- 敏感字段和原始内容脱敏。

## 授权/登录状态看板

Auth Hub 控制台在任务首页和 `/dashboard/connectors` 提供“授权/登录关注项”摘要，用于项目负责人区分静态合同、执行器在线证据和真实平台验证，并快速判断哪些平台需要本机续登、验证码、凭据配置或连接器维护。

该摘要只读取公开安全信息：

- connector registry 中的平台、状态、模式、能力和稳定问题代码。
- 最新执行器心跳中的平台、能力模式、在线/过期状态和服务端时间戳。
- `action_required` 与 `approval_required` 任务中的公开错误码、平台名和任务 ID。
- 已脱敏的任务摘要。

该摘要不会读取或展示 Cookie、浏览器 Profile、refresh token、access token、二维码、截图、账号详情、原始平台响应或本机私有路径。真实登录态仍只保存在本机私有边界内，由私有 connector 或本地执行器负责。

机器读取入口：

```text
GET /api/auth-status
Authorization: Bearer <token with connectors:read>
```

返回内容包含 `connectors`、`issues`、`executorRuntime` 和 `authStatus`。`authStatus.summary` 给出 `ready`、`unverified`、`needs_action`、`reserved`、`blocked` 计数；`authStatus.items` 按平台给出状态、证据来源、执行器状态、`verifiedOperations`、探测有效期、处理建议、公开原因码和最多 5 个关联任务 ID。内部 `leaseId`、executor session 和 heartbeat revision 不会返回。

状态口径：

- `ready`：同一绑定执行器 session 同时具备新鲜 private heartbeat 和新鲜成功 probe；只证明 `verifiedOperations` 中列出的操作。
- `unverified`：合同或方法可能存在，但执行器心跳缺失/过期，或尚未执行真实只读健康探测；需要真实平台能力的上游应失败关闭。
- `needs_action`：已有关联 `action_required` 或 `approval_required` 任务，例如 `login_expired`、`captcha_required`、`credential_missing`、`interactive_approval_required`。
- `reserved`：公开仓仅预留合同位，暂未接入真实账号。
- `blocked`：connector 契约缺失或配置异常，需要维护者修复。

该入口的目标不是替代真实平台会话探测，而是把“合同声明、执行器在线证据、已经被执行器发现且需要人处理或批准的事项”集中展示。其他项目可以读取该接口决定是否暂停自动化、提示维护者或等待 AI Link 本地执行器完成续登后重试；普通代码和文档任务不需要轮询该接口。

依赖项目应只检查自己需要的平台，避免被无关平台状态阻断：

```powershell
npm run auth-hub:status:strict -- --platform github
npm run auth-hub:status:strict -- --platform wechat_official
npm run auth-hub:status:strict -- --platform xiaohongshu
```

严格模式对 `unverified`、`needs_action`、`reserved`、`blocked`、缺失平台和过期 probe 都返回非零退出码。它只读取状态，不会自动发起探测或平台调用。
