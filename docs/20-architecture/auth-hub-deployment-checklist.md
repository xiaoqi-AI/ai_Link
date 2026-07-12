# 授权中枢部署检查清单

状态：部署前操作清单。真实账号、密钥和登录态不得写入本文件。

## 1. 本地验证

在部署前先确认公开骨架可运行：

```powershell
npm install
npm test
npm run security:scan
npm run auth-hub:secrets:new
npm run auth-hub:deploy:check
npm run auth-hub:local:start
npm run auth-hub:smoke
npm run auth-hub:executor:start
```

确认后可停止本地进程：

```powershell
npm run auth-hub:executor:stop
npm run auth-hub:local:stop
```

## 2. Render 服务

使用 `render.yaml` 创建 Web Service 和 Postgres。生产环境必须配置：

- `NODE_ENV=production`
- `AI_LINK_BASE_URL=<confirmed dedicated Auth Hub URL>`，建议候选为 `https://auth.xiao-qi-ai.com`
- `DATABASE_URL`
- `AI_LINK_APP_PASSWORD`
- `AI_LINK_SESSION_SECRET`
- `AI_LINK_SESSION_MAX_AGE_SECONDS=28800`
- `AI_LINK_CSRF_TOKEN_TTL_SECONDS=900`
- `AI_LINK_LOGIN_MAX_FAILURES=5`
- `AI_LINK_LOGIN_WINDOW_SECONDS=900`
- `AI_LINK_LOGIN_BLOCK_SECONDS=900`
- `AI_LINK_LOGIN_MAX_KEYS=1000`
- `AI_LINK_ADMIN_TOKEN`
- `AI_LINK_EXECUTOR_TOKEN`
- `AI_LINK_EXECUTOR_ID=local-executor`（或另一个受限公开标识，必须与本地执行器一致）
- `AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS=60000`
- `AI_LINK_CONNECTOR_PROBE_TTL_MS=900000`
- `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS=true`
- `AI_LINK_ALLOWED_ACCESS_EMAILS`
- `AI_LINK_CLOUDFLARE_ACCESS_AUD`
- `AI_LINK_CLOUDFLARE_TEAM_DOMAIN` 或 `AI_LINK_CLOUDFLARE_ACCESS_ISSUER`
- `AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN=true`（仅当负责人批准本地执行器使用 Service Auth 时）
- 可选运行时：`AI_LINK_CODEX_TOKEN`；完整远程 smoke 必填

邮件提醒可选配置：

- `SMTP_URL`
- `APPROVAL_EMAIL_TO`
- `APPROVAL_EMAIL_FROM`

所有真实值只放 Render Secrets、Bitwarden Secrets Manager 或本机环境变量，不写入 Git。

公开蓝图使用 `basic-256mb` Postgres、`ipAllowList: []`、`autoDeployTrigger: checksPass` 和 `numInstances: 1`。数据库仅允许 Render 私网连接；service token 许可使用 `sync: false`，部署时必须明确选择。登录限流当前只在单个 Web 进程中保存有界匿名状态，部署后不得手工扩为多实例；需要扩容时先由负责人批准共享限流方案。Render service 与数据库 region 创建后不可修改，当前蓝图不替负责人选择；创建资源前先确定是否使用推荐的 `singapore`，否则 Render 默认 `oregon`。

生产部署前，在只注入生产环境变量的终端中运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-auth-hub-deployment.ps1 -Production -BaseUrl "https://auth.xiao-qi-ai.com"
```

生产检查会要求持久化 `DATABASE_URL`、当前 Render Postgres 规格、数据库私网入口、CI 通过后部署策略，以及应用自身开启 Cloudflare Access origin guard 并配置 JWT 校验所需的 AUD tag 和 team domain/issuer。生产进程也会在启动配置阶段失败关闭：缺少数据库、AUD、issuer/team domain，或既没有授权邮箱又未明确允许 service token 时拒绝启动。

Render 官方参考：[Blueprint YAML Reference](https://render.com/docs/blueprint-spec)、[Render Postgres flexible plans](https://render.com/docs/postgresql-refresh)。

## 3. Cloudflare Access

独立 Auth Hub 域名应先经过 Cloudflare Access，再进入应用内登录。当前 `voice.xiao-qi-ai.com` 承载的不是 Auth Hub，不能覆盖；`auth.xiao-qi-ai.com` 是建议候选，创建 DNS 前仍需负责人确认。

检查项：

- 只允许你的邮箱或明确授权账号访问。
- 禁止公开匿名访问。
- 保留应用内登录作为第二层门禁。
- DNS 指向 Render 后，确认 HTTPS 可用。
- 记录应用 AUD tag 到 `AI_LINK_CLOUDFLARE_ACCESS_AUD`。
- 确认源站验证 JWT 的 RS256 签名、issuer 和 audience；不得把 `Cf-Access-Authenticated-User-Email` 当成独立凭据。
- 用户 JWT 的 `email` 必须与转发邮件头一致；服务令牌 JWT 的 `common_name` 不得当作用户邮箱。
- 本地执行器如需穿过 Cloudflare Access，创建 Service Auth 凭据，并只在本机或 Bitwarden 中保存 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`。

官方参考：[验证 Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Application token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)、[Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)。

## 4. 本地执行器

本地执行器运行在当前电脑或你控制的常在线机器上。

生产连接时设置：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前确认
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_ID="local-executor"
$env:CF_ACCESS_CLIENT_ID="<cloudflare-service-auth-client-id>"
$env:CF_ACCESS_CLIENT_SECRET="<cloudflare-service-auth-client-secret>"
npm run auth-hub:executor:start
```

执行器状态文件：

- `runtime/tmp/auth-hub-executor-process.json`
- `runtime/tmp/auth-hub-executor.json`
- `runtime/tmp/auth-hub-executor.log`
- `runtime/tmp/auth-hub-executor-runner.ps1`

`auth-hub-executor-runner.ps1` 会包含本地执行器启动所需环境变量，因此必须留在被 Git 忽略的 `runtime/tmp/`，不要复制到公开位置。

执行器会在每轮领取任务前发送最小能力心跳。Auth Hub 默认 60 秒后把未更新的记录标记为 `stale`；心跳失败不阻塞普通任务 lease。生产 token 绑定固定 executor id，每次执行器启动使用新的进程 session；只有同一身份/session 的新鲜 private heartbeat 才能领取显式 probe。状态中心显示 online 只证明进程在线且方法已加载，不证明真实账号、Cookie、凭据或平台 API 健康。

## 5. 敏感边界

不得进入 Git、公开 issue、知识库或聊天记录：

- `.env`
- API key、token、密码、证书
- Cookie、浏览器 Profile、二维码、登录态
- 私密截图、平台原始内容、未脱敏页面快照
- `runtime/private/`

## 6. 验收标准

- 已确认的独立 Auth Hub 域名 `/healthz` 在 Cloudflare Access 后可用，并返回 `service=ai-link-auth-hub`。
- 未授权浏览器无法进入控制台。
- 缺少 JWT 校验参数、签名无效、audience/issuer 错误或邮件身份不一致的请求均被源站拒绝。
- 应用内登录可进入 dashboard。
- 应用内签名会话在 `AI_LINK_SESSION_MAX_AGE_SECONDS` 到期后由服务端拒绝，不能靠手工重放 Cookie 延长。
- 登录、创建任务、审批、重试和退出均要求同源请求与有效 CSRF token；登录前 token 不能在登录后使用，过期或跨会话 token 必须返回 403 且不改变业务状态。
- 达到登录失败阈值后返回 429 和 `Retry-After`；正确密码不能绕过锁定，窗口到期后恢复。
- 控制台只接受本地安全跳转；任务只有 `action_required` 或 `failed` 可重试，非法或重复审批不得改变状态。
- 本地执行器能领取任务并回传结果。
- `GET /api/connectors` 显示至少一个 online executor heartbeat；没有显式只读 probe 时，真实能力仍显示 `unverified` 和 `canRunReal=false`。
- 显式 probe 只允许三项健康操作，并验证 token/executor/session/lease 绑定、重放拒绝、服务端 TTL 与 `verifiedOperations` 操作级口径。
- `auth-hub:smoke` 可跑通 mock 全链路。
- 发布动作仍需要审批。
- `npm run security:scan` 无敏感发现。

远端部署后可运行：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前确认
$env:AI_LINK_ADMIN_TOKEN="<admin-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_ID="local-executor"
$env:AI_LINK_CODEX_TOKEN="<codex-token-from-secret-store>"
$env:AI_LINK_APP_PASSWORD="<app-password-from-secret-store>"
$env:CF_ACCESS_CLIENT_ID="<cloudflare-service-auth-client-id>"
$env:CF_ACCESS_CLIENT_SECRET="<cloudflare-service-auth-client-secret>"
npm run auth-hub:remote:next
npm run auth-hub:remote:smoke
```

如果只想先确认远端健康和 API 创建任务，不启动本地执行器，可用：

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -SkipExecutor
```

`-SkipExecutor` 只跳过执行器领取与回传；应用密码、Admin token 和受限 Codex token 仍然必填，否则 smoke 失败。

完整远端 mock 空跑会验证：

- `/healthz` 可访问。
- 未开启 `-ExpectAccessGate` 时，应用登录页可访问；开启 `-ExpectAccessGate` 时，未带 Access 头的 `/login` 应被 Cloudflare Access 拦截或重定向。
- 应用密码必填，应用内登录必须进入 dashboard。
- 管理 token 可以创建 `full_chain` mock 任务。
- 控制台/API 可读取连接器公开状态，响应中不应出现 Cookie、浏览器 Profile、`runtime/private/` 等私有状态。
- smoke 进程会显式清除 `AI_LINK_PRIVATE_CONNECTOR_MODULE`，连接器模式必须保持公开 mock/reserved，不能出现 `private`。
- 本地执行器上报在线心跳，响应只包含受限 executor id、能力模式和服务端时间戳。
- 受限 Codex token 可以读取脱敏任务，但不能领取执行器任务，也不能批准发布。
- 本地执行器能领取任务、回写 `approval_required`、等待人工审批。
- 管理 token 批准后，本地执行器再次领取并完成 mock 发布步骤。
- 任务详情和审计日志只包含脱敏摘要。

这些检查仍然只覆盖 mock 链路；真实微信、公众号、GitHub、小红书、朱雀AI、抖音、知乎、头条账号登录、只读探测和正式发布不属于本轮验收。
