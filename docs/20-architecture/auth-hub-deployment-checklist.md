# 授权中枢部署检查清单

状态：部署前操作清单。真实账号、密钥和登录态不得写入本文件。

## 0. 先确认本次部署边界

本清单用于把本地 Auth Hub 变成受控远程后台。它不会把小红书、微信公众号或其他平台的 Cookie、二维码和浏览器 Profile 上传到远端；真实平台登录态仍留在本地执行器，远端只保存任务、审批、公开状态和脱敏审计。

开始创建收费资源或修改公网 DNS 前，负责人必须逐项确认下表。没有确认的项目保持停止，不用临时值绕过：

| 决策项 | 当前建议 | 价值 | 主要风险 / 代价 | 负责人确认 |
| --- | --- | --- | --- | --- |
| 独立域名 | `auth.xiao-qi-ai.com` | 与内容站、API 和其他项目隔离 | DNS 配错会造成短时不可用 | 待确认 |
| Render 区域 | `singapore` | 靠近主要使用者和本地执行器 | Web 与数据库创建后不能直接改区 | 待确认 |
| Web 规格 | Starter、单实例 | 满足当前状态中心和人工审批负载 | 产生持续费用；单实例不支持无感高可用 | 待确认 |
| Postgres 规格 | `basic-256mb` | 提供持久化任务、审批和审计 | 产生持续费用；容量和备份能力有限 | 待确认 |
| 浏览器允许账号 | 仅填写明确批准的邮箱 | 防止匿名或组织内其他人进入后台 | 邮箱写错会把负责人锁在门外 | 待确认 |
| 本地执行器 Service Auth | 允许，且只发一个受限 service token | 本地执行器可重复处理任务，不需每次浏览器登录 | 凭据泄露时可绕过浏览器登录层，必须可撤销 | 待确认 |
| 初始密钥存放 | Render Secrets + 负责人掌握的本机密码库 | 不阻塞首次部署 | 后续应迁移到统一 secret manager 并建立轮换 | 待确认 |
| Render 原生子域名 | 首次生产 Blueprint 即禁用 | 收敛绕过 Cloudflare 的源站入口 | 初次验收只能走自定义域名和 Render 内部健康状态 | 待确认 |
| 自动数据清理 | 首次上线暂不开 Cron，只做 dry-run | 避免误删审批和审计证据 | 数据会继续增长，需要后续维护窗口 | 待确认 |
| 备份 / PITR | 首次 retention apply 前单独确认 | 数据清理出错时可恢复 | 可能需要更高数据库规格或额外费用 | 待确认 |

### 0.1 必须满足的代码前置条件

1. Auth Hub 远程化相关堆叠 PR 已按依赖顺序合并到 `main`，且 `Verify` 与 `Postgres integration` 均通过。
2. `main` 中的 `render.yaml`、部署检查、远程 smoke、Cloudflare Access 源站校验和数据生命周期实现来自同一条已验证提交链。
3. 本地运行 `npm run auth-hub:remote:next:json`，确认输出中的仓库工作树干净；远端未创建时 `remote healthz` 失败是预期阻塞，不代表代码失败。
4. 未获得负责人对上表的明确确认前，不创建 Render 收费资源、不改 DNS、不生成生产 Service Auth 凭据。

## 0.2 推荐人工操作顺序（逐屏）

这套顺序先取得 Cloudflare Access 所需的 AUD 和 Service Auth 信息，再一次性填写 Render 的生产变量，避免用假值启动生产服务。

### 阶段 A：创建 Cloudflare Access 应用

1. 登录 Cloudflare Dashboard，进入 **Zero Trust**。
2. 依次进入 **Access controls** -> **Applications** -> **Create new application**。
3. 选择 **Self-hosted and private**，添加公开 hostname：
   - Subdomain：`auth`
   - Domain：`xiao-qi-ai.com`
   - Path：留空
4. 应用名填写 `AI Link Auth Hub`，会话时长建议不超过 8 小时，与应用自身 8 小时会话上限对齐。
5. 新建浏览器策略：
   - Action：`Allow`
   - Include：只选负责人明确批准的邮箱
   - 不使用 `Everyone`、`Emails ending in` 或“所有有效邮箱”作为首版策略
6. 保存应用，记录该应用的 **AUD tag** 和团队域名 `<team>.cloudflareaccess.com`。二者不是密码，但仍只填入部署环境，不写到公开文档实例。
7. 此时 hostname 尚未接入 Render 是正常的；Access 策略可以先创建，等 DNS 切到 Cloudflare 代理后才开始拦截流量。

Cloudflare 官方入口：[创建 Access 应用](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/)、[Access 策略](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)。

### 阶段 B：创建本地执行器 Service Auth

只有负责人确认允许本地执行器跨过 Cloudflare Access 时才执行：

1. 在 Zero Trust 进入 **Access controls** -> **Service credentials** -> **Service Tokens**。
2. 创建一个名称明确、可单独撤销的 token，例如 `ai-link-local-executor`。
3. 立即把 `Client ID` 和 `Client Secret` 存入负责人掌握的本机密码库；Secret 通常只完整显示一次，不截图、不发聊天、不写文档。
4. 回到 `AI Link Auth Hub` 应用，新增一条 `Service Auth` 策略，Include 只选择刚创建的 service token。
5. 不把 Service Auth 凭据给浏览器用户，也不与 Admin、Codex 或 Executor token 复用。

本地执行器通过 `CF-Access-Client-Id` / `CF-Access-Client-Secret` 请求头使用这对凭据。官方说明：[Cloudflare Access Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)。

### 阶段 C：生成应用密钥

1. 在 `D:\codex_workplace\ai_Link` 打开仅负责人可见的 PowerShell。
2. 运行：

```powershell
npm run auth-hub:secrets:new
```

3. 把生成的五项值分别保存为 `AI_LINK_APP_PASSWORD`、`AI_LINK_SESSION_SECRET`、`AI_LINK_ADMIN_TOKEN`、`AI_LINK_EXECUTOR_TOKEN`、`AI_LINK_CODEX_TOKEN`。
4. 每项使用不同随机值；不要把终端输出截图，不要把结果写进 `.env`、Git、issue、PR 或知识库。
5. 保存完成后清除终端滚屏。后续 smoke 使用密码库里的同一组值，不从 Render 页面临时复制。

### 阶段 D：创建 Render Blueprint

1. **先在代码侧完成部署决策，不进入 Render。** 负责人批准后，在独立 `codex/` 分支修改 `render.yaml`：Web 与 Postgres 写入同一个 `region`，Web 写入 `domains: [auth.xiao-qi-ai.com]` 和 `renderSubdomainPolicy: disabled`。Render 官方要求至少存在一个自定义域名后才能禁用 `onrender.com`。
2. 在本机运行完整测试、`auth-hub:deploy:check` 和生产静态预检；region、正式域名和原生子域名三项 Blueprint 门禁必须全部通过。
3. 提交变更、创建 PR，等待 GitHub `Verify` 与 `Postgres integration` 通过，并由负责人明确授权合并到受保护的 `main`。确认 `origin/main` 已包含这次部署决策提交后才继续。
4. 登录 Render Dashboard，点击 **New** -> **Blueprint**。
5. 连接 GitHub 仓库 `xiaoqi-AI/ai_Link`，部署分支只选择已经包含部署决策的 `main`。
6. Render 读取根目录 `render.yaml` 后，在创建资源前核对：
   - Web Service：`ai-link-auth-hub`
   - Postgres：`ai-link-postgres`
   - Web plan：Starter，实例数 1
   - Postgres plan：`basic-256mb`
   - 自动部署：只有检查通过后部署
   - Web 与 Postgres region 一致
   - 正式域名为 `auth.xiao-qi-ai.com`
   - `renderSubdomainPolicy` 为 `disabled`
7. 对所有 `sync: false` 变量填写真实生产值：
   - `AI_LINK_BASE_URL=https://auth.xiao-qi-ai.com`
   - `AI_LINK_APP_PASSWORD`、`AI_LINK_SESSION_SECRET`
   - `AI_LINK_ADMIN_TOKEN`、`AI_LINK_EXECUTOR_TOKEN`、`AI_LINK_CODEX_TOKEN`
   - `AI_LINK_EXECUTOR_ID=local-executor`
   - `AI_LINK_ALLOWED_ACCESS_EMAILS=<负责人批准的完整邮箱>`
   - `AI_LINK_CLOUDFLARE_ACCESS_AUD=<阶段 A 的 AUD tag>`
   - `AI_LINK_CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com`
   - `AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN=true`，仅在阶段 B 已批准并完成时填写；否则填 `false`
8. `DATABASE_URL` 必须来自 Blueprint 创建的 Render Postgres 私网连接，不手工粘贴公网数据库地址。
9. 创建 Blueprint，等待数据库和 Web Service 部署成功。由于原生子域名已禁用，先在 Render Dashboard 通过服务状态和 Logs 确认 `/healthz` 内部健康检查通过，再立即进入阶段 E 配置 DNS。

Render 官方入口：[Blueprint YAML Reference](https://render.com/docs/blueprint-spec)、[Web Services](https://render.com/docs/web-services)。

### 阶段 E：绑定域名和 DNS

1. 在 Render 打开 `ai-link-auth-hub` -> **Settings** -> **Custom Domains**，确认 Blueprint 声明的 `auth.xiao-qi-ai.com` 已出现；如果没有，停止并修复 Blueprint，不在 Dashboard 制造配置漂移。
2. 记录 Render 页面给出的 `*.onrender.com` CNAME 目标。
3. 在 Cloudflare DNS 新增：
   - Type：`CNAME`
   - Name：`auth`
   - Target：Render 给出的目标
   - Proxy status：先选 **DNS only**，供 Render 完成域名和证书验证
4. 删除同一 hostname 上冲突的旧 A、AAAA 或 CNAME 记录；尤其不要保留 AAAA。
5. Cloudflare **SSL/TLS encryption mode** 设为 `Full`，不要用 `Flexible`。
6. 回到 Render 点击验证，等待自定义域名显示有效证书。
7. 证书有效后，把 Cloudflare DNS 的 Proxy status 切为 **Proxied**。从这一步开始，浏览器流量才经过 Cloudflare Access。
8. 访问 `https://auth.xiao-qi-ai.com/login`，应先看到 Cloudflare Access，再看到 Auth Hub 应用内登录；任何一层缺失都不算验收通过。

Render 官方说明：[Custom Domains](https://render.com/docs/custom-domains)、[Configure Cloudflare DNS](https://render.com/docs/configure-cloudflare-dns)。

### 阶段 F：生产预检与首次验收

1. 在自定义域名仍为 DNS only、Access 尚未经过 Proxied 入口时，可以先在不含 Access 凭据的终端运行：

```powershell
npm run auth-hub:remote:next:json
```

2. 域名切为 Proxied 且 Access 生效后，无凭据 `/healthz` 可能被 Access 拦截；最终态应先从密码库临时注入 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`，再运行 `remote:next`。工具会带 Service Auth 请求 `/healthz`，但不打印凭据。
   - 项目没有隐式批准域名；即使采用建议候选 `auth.xiao-qi-ai.com`，也必须在当前 smoke 终端设置 `AI_LINK_AUTH_HUB_ALLOWED_HOSTS=auth.xiao-qi-ai.com`。
   - 只写批准的 hostname，多个值用逗号分隔；不写 URL、路径、端口或通配符。
   - loopback 仅用于本地开发且永远不附加 Service Auth；远程目标必须使用 HTTPS。
   - 状态客户端、本地执行器和 smoke 都禁止自动跟随重定向，防止 Bearer 或 Service Auth 凭据被带到其他地址。
3. 从本机密码库临时注入 smoke 所需变量，按本文件第 6 节运行生产预检和 Service Auth API/执行器 smoke。
4. 验证结束立即关闭该 PowerShell；不要用 `setx` 把生产 token 永久写入用户环境。
5. 首次验收必须保存三条独立证据：未授权浏览器在 Cloudflare 边缘被拦截；批准邮箱可进入应用内登录并通过 CSRF 检查；本地执行器可用 Service Auth 完成 mock 任务。Service Auth 不是浏览器身份，不能替代批准邮箱验收。
6. 真实平台登录或发布不属于远程后台首次验收；不得在这一步顺带测试真实发布。

### 阶段 G：失败时回滚

1. **代码回滚**：在 Render 的 Deploys / Events 中回退到上一个成功部署，不强推或重写 Git 历史。
2. **访问回滚**：Access 策略异常时先禁用 Cloudflare DNS 记录或切回 DNS only。应用的源站 JWT guard 会让登录/API 失败关闭；不要添加公开 Bypass 策略。
3. **执行器回滚**：停止本地执行器，撤销对应 Cloudflare service token，并轮换 `AI_LINK_EXECUTOR_TOKEN`。
4. **密钥回滚**：在 Render 更新受影响的单项 secret 后重新部署；不要复用泄露值，也不要一次轮换所有无关凭据。
5. **数据库保护**：不删除 Postgres，不运行 retention apply。需要 PITR 或数据恢复时先由数据库负责人确认恢复点和影响范围。
6. **保留证据**：只保存脱敏错误码、部署提交号和时间；不保存响应 token、Cookie、Access JWT 或平台原始数据。

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
- `AI_LINK_ARTIFACT_RETENTION_DAYS=7`
- `AI_LINK_APPROVAL_RETENTION_DAYS=7`
- `AI_LINK_AUDIT_RETENTION_DAYS=180`
- `AI_LINK_MAINTENANCE_AUDIT_RETENTION_DAYS=365`
- `AI_LINK_HEARTBEAT_RETENTION_GRACE_HOURS=24`
- `AI_LINK_PROBE_RETENTION_GRACE_DAYS=7`
- `AI_LINK_RETENTION_MAX_ROWS_PER_TABLE=500`
- `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS=true`
- `AI_LINK_ALLOWED_ACCESS_EMAILS`
- `AI_LINK_CLOUDFLARE_ACCESS_AUD`
- `AI_LINK_CLOUDFLARE_TEAM_DOMAIN` 或 `AI_LINK_CLOUDFLARE_ACCESS_ISSUER`
- `AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN=true`（仅当负责人批准本地执行器使用 Service Auth 时）
- `AI_LINK_CODEX_TOKEN`：Blueprint 中为 `sync: false`；本项目需要受限项目客户端能力，因此首次部署必须填写，远程 smoke 也会校验
- `AI_LINK_CODEX_SCOPES=tasks:create,tasks:read,connectors:read,audit:write`：受限项目客户端可提交任务、读脱敏状态并追加审计，但不能领取执行器任务或批准发布

邮件提醒可选配置：

- `SMTP_URL`
- `APPROVAL_EMAIL_TO`
- `APPROVAL_EMAIL_FROM`

所有真实值只放 Render Secrets、Bitwarden Secrets Manager 或本机环境变量，不写入 Git。

JWT issuer 配置二选一：优先填写 `AI_LINK_CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com`，应用会据此推导 issuer；只有需要显式覆盖时才使用 `AI_LINK_CLOUDFLARE_ACCESS_ISSUER`。不能两项都空，也不要填写普通 Cloudflare Dashboard 域名。

公开蓝图使用 `basic-256mb` Postgres、`ipAllowList: []`、`autoDeployTrigger: checksPass` 和 `numInstances: 1`。数据库仅允许 Render 私网连接；service token 许可使用 `sync: false`，部署时必须明确选择。登录限流当前只在单个 Web 进程中保存有界匿名状态，部署后不得手工扩为多实例；需要扩容时先由负责人批准共享限流方案。Render service 与数据库 region 创建后不可修改，当前蓝图不替负责人选择；创建资源前先确定是否使用推荐的 `singapore`，否则 Render 默认 `oregon`。

生产部署前，在只注入生产环境变量的终端中运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-auth-hub-deployment.ps1 -Production -BaseUrl "https://auth.xiao-qi-ai.com"
```

该命令是**本地静态预检**：它检查当前 PowerShell 中变量是否存在、长度是否合理，并检查本地 `render.yaml` 的合同。它会要求 Web/Postgres region 明确且一致、声明 `auth.xiao-qi-ai.com` 并禁用 Render 原生子域名，但仍不读取 Render 实际环境、不连接生产数据库，也不能证明私网 URL 或远端 CI 状态；这些必须在 Render Dashboard 和 GitHub 单独核对。生产进程仍会在启动配置阶段失败关闭：缺少数据库、AUD、issuer/team domain、批准邮箱或已批准的 Service Auth 时拒绝启动。

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
- 本地执行器如需穿过 Cloudflare Access，创建 Service Auth 凭据，并只在本机或 Bitwarden 中保存 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`；目标 hostname 必须显式加入 `AI_LINK_AUTH_HUB_ALLOWED_HOSTS`，请求不得自动跟随重定向。

官方参考：[验证 Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Application token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)、[Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)。

## 4. 本地执行器

本地执行器运行在当前电脑或你控制的常在线机器上。

生产连接时设置：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前确认
$env:AI_LINK_AUTH_HUB_ALLOWED_HOSTS="auth.xiao-qi-ai.com"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_ID="local-executor"
$env:CF_ACCESS_CLIENT_ID="<cloudflare-service-auth-client-id>"
$env:CF_ACCESS_CLIENT_SECRET="<cloudflare-service-auth-client-secret>"
```

生产连接必须显式传入目标和执行器标识，防止旧的本地状态文件覆盖远程 URL：

```powershell
powershell -ExecutionPolicy Bypass -File tools/start-auth-hub-executor.ps1 `
  -BaseUrl $env:AI_LINK_BASE_URL `
  -ExecutorId $env:AI_LINK_EXECUTOR_ID
```

启动脚本会优先使用显式参数，其次使用当前进程环境变量，最后才读取本地 Auth Hub 状态。远程 HTTPS 目标缺少 `AI_LINK_EXECUTOR_TOKEN` 时会拒绝启动，不会回退到开发 token。

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

- 已确认的独立 Auth Hub 域名 `/healthz` 可用，并返回 `ok=true`、`service=ai-link-auth-hub`。
- 未授权浏览器无法进入控制台。
- 缺少 JWT 校验参数、签名无效、audience/issuer 错误或邮件身份不一致的请求均被源站拒绝。
- 应用内登录可进入 dashboard。
- 应用内签名会话在 `AI_LINK_SESSION_MAX_AGE_SECONDS` 到期后由服务端拒绝，不能靠手工重放 Cookie 延长。
- 登录、创建任务、审批、重试和退出均要求同源请求与有效 CSRF token；登录前 token 不能在登录后使用，过期或跨会话 token 必须返回 403 且不改变业务状态。
- 达到登录失败阈值后返回 429 和 `Retry-After`；正确密码不能绕过锁定，窗口到期后恢复。
- 控制台只接受本地安全跳转；任务只有 `action_required` 或 `failed` 可重试，非法或重复审批不得改变状态。
- 本地执行器能领取任务并回传结果。
- `GET /api/connectors` 显示至少一个 online executor heartbeat；没有显式只读 probe 时，真实能力仍显示 `unverified` 和 `canRunReal=false`。
- 所有执行器结果都验证 token/executor/session/lease 绑定，拒绝未领取、错误绑定、过期租约、终态改写和重放。
- 显式 probe 只允许三项健康操作；GitHub 证据按 scope 与目标绑定，验证服务端 TTL 与 `verifiedOperations` 精确限定口径。
- 远程 Bearer/Service Auth 只发往显式批准的 HTTPS hostname；loopback 不携带 Service Auth，所有相关客户端拒绝重定向。
- `auth-hub:smoke` 可跑通 mock 全链路。
- 发布动作仍需要审批。
- `npm run security:scan` 无敏感发现。
- `npm run auth-hub:retention:json` 可完成只读预览；首次生产 apply 前已由数据库负责人验证备份或 PITR 恢复点、记录恢复点时间，并单独批准 `--apply --confirm-backup`。

远端部署后可运行：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前确认
$env:AI_LINK_AUTH_HUB_ALLOWED_HOSTS="auth.xiao-qi-ai.com"
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

`auth-hub:remote:smoke` 只自动验证 Cloudflare 边缘拦截证据、Service Auth API、受限 Codex token、执行器、审批和审计。它会显式跳过应用内浏览器登录，并把该项标为人工检查；负责人仍需用批准邮箱在浏览器进入 Access，再用应用密码进入 dashboard。

如果只想先确认远端健康和 API 创建任务，不启动本地执行器，可用：

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -SkipExecutor -SkipAppLogin -ExpectAccessGate
```

`-SkipExecutor` 只跳过执行器领取与回传；`-SkipAppLogin` 只允许在已提供 Cloudflare Service Auth 凭据时使用。Admin token 和受限 Codex token 仍然必填；应用密码由生产静态预检和独立浏览器验收确认。

使用 `-ExpectAccessGate` 时，脚本只在捕获到 Cloudflare Access 登录跳转或可识别的边缘 Access 页面时通过。普通 `401` / `403` 可能来自应用自身的 JWT guard，不能单独证明 Cloudflare 边缘策略生效；证据不明确时脚本必须失败，并由负责人在浏览器确认。

只检查边缘拦截时可同时使用 `-AccessGateOnly -ExpectAccessGate`。脚本禁止单独使用 `-AccessGateOnly`，避免公开登录页返回 `200` 时被误报为门禁通过。

完整远端 mock 空跑会验证：

- `/healthz` 可访问。
- 开启 `-ExpectAccessGate` 时，未带 Access 头的 `/login` 必须返回可识别的 Cloudflare Access 边缘证据；普通状态码不算通过。
- 自动 remote smoke 不把 Service Auth 当作浏览器身份；批准邮箱和应用密码进入 dashboard 由独立人工验收完成。
- 管理 token 可以创建 `full_chain` mock 任务。
- 控制台/API 可读取连接器公开状态，响应中不应出现 Cookie、浏览器 Profile、`runtime/private/` 等私有状态。
- smoke 进程会显式清除 `AI_LINK_PRIVATE_CONNECTOR_MODULE`，连接器模式必须保持公开 mock/reserved，不能出现 `private`。
- 本地执行器上报在线心跳，响应只包含受限 executor id、能力模式和服务端时间戳。
- 受限 Codex token 可以读取脱敏任务，但不能领取执行器任务，也不能批准发布。
- 本地执行器能领取任务、回写 `approval_required`、等待人工审批。
- 管理 token 批准后，本地执行器再次领取并完成 mock 发布步骤。
- 任务详情和审计日志只包含脱敏摘要。

生产排障只在 Render Logs 中按时间和请求错误码定位。日志验收应抽查登录失败、CSRF 拒绝、任务创建、审批和执行器心跳，确认不存在密码、Bearer token、Cloudflare Access JWT、Cookie、Service Auth secret、数据库连接串或平台原始响应；发现任一敏感值立即停止验收、撤销相应凭据并按阶段 G 回滚。

这些检查仍然只覆盖 mock 链路；真实微信、公众号、GitHub、小红书、朱雀AI、抖音、知乎、头条账号登录、只读探测和正式发布不属于本轮验收。
