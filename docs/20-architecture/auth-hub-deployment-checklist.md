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
- `AI_LINK_BASE_URL=https://voice.xiao-qi-ai.com`
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

邮件提醒可选配置：

- `SMTP_URL`
- `APPROVAL_EMAIL_TO`
- `APPROVAL_EMAIL_FROM`

所有真实值只放 Render Secrets、Bitwarden Secrets Manager 或本机环境变量，不写入 Git。

生产部署前，在只注入生产环境变量的终端中运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-auth-hub-deployment.ps1 -Production -BaseUrl "https://voice.xiao-qi-ai.com"
```

生产检查会要求应用自身开启 Cloudflare Access origin guard，并配置 Access JWT 校验所需的 AUD tag 和 team domain/issuer。

## 3. Cloudflare Access

`voice.xiao-qi-ai.com` 应先经过 Cloudflare Access，再进入应用内登录。

检查项：

- 只允许你的邮箱或明确授权账号访问。
- 禁止公开匿名访问。
- 保留应用内登录作为第二层门禁。
- DNS 指向 Render 后，确认 HTTPS 可用。
- 记录应用 AUD tag 到 `AI_LINK_CLOUDFLARE_ACCESS_AUD`。
- 本地执行器如需穿过 Cloudflare Access，创建 Service Auth 凭据，并只在本机或 Bitwarden 中保存 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`。

## 4. 本地执行器

本地执行器运行在当前电脑或你控制的常在线机器上。

生产连接时设置：

```powershell
$env:AI_LINK_BASE_URL="https://voice.xiao-qi-ai.com"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
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

## 5. 敏感边界

不得进入 Git、公开 issue、知识库或聊天记录：

- `.env`
- API key、token、密码、证书
- Cookie、浏览器 Profile、二维码、登录态
- 私密截图、平台原始内容、未脱敏页面快照
- `runtime/private/`

## 6. 验收标准

- `https://voice.xiao-qi-ai.com/healthz` 在 Cloudflare Access 后可用。
- 未授权浏览器无法进入控制台。
- 应用内登录可进入 dashboard。
- 本地执行器能领取任务并回传结果。
- `auth-hub:smoke` 可跑通 mock 全链路。
- 发布动作仍需要审批。
- `npm run security:scan` 无敏感发现。

远端部署后可运行：

```powershell
$env:AI_LINK_BASE_URL="https://voice.xiao-qi-ai.com"
$env:AI_LINK_ADMIN_TOKEN="<admin-token-from-secret-store>"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
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

完整远端 mock 空跑会验证：

- `/healthz` 可访问。
- 未开启 `-ExpectAccessGate` 时，应用登录页可访问；开启 `-ExpectAccessGate` 时，未带 Access 头的 `/login` 应被 Cloudflare Access 拦截或重定向。
- 提供 `AI_LINK_APP_PASSWORD` 时，应用内登录能进入 dashboard。
- 管理 token 可以创建 `full_chain` mock 任务。
- 控制台/API 可读取连接器公开状态，响应中不应出现 Cookie、浏览器 Profile、`runtime/private/` 等私有状态。
- 受限 Codex token 可以读取脱敏任务，但不能领取执行器任务，也不能批准发布。
- 本地执行器能领取任务、回写 `approval_required`、等待人工审批。
- 管理 token 批准后，本地执行器再次领取并完成 mock 发布步骤。
- 任务详情和审计日志只包含脱敏摘要。

这些检查仍然只覆盖 mock 链路；真实微信、朱雀AI、抖音、小红书、知乎、头条账号登录和正式发布不属于本轮验收。
