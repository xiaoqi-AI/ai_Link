# 授权中枢部署检查清单

状态：部署前操作清单。真实账号、密钥和登录态不得写入本文件。

## 1. 本地验证

在部署前先确认公开骨架可运行：

```powershell
npm install
npm test
npm run security:scan
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

如果已人工确认 Cloudflare Access 生效，可在该终端设置：

```powershell
$env:AI_LINK_CLOUDFLARE_ACCESS_ENABLED="1"
```

## 3. Cloudflare Access

`voice.xiao-qi-ai.com` 应先经过 Cloudflare Access，再进入应用内登录。

检查项：

- 只允许你的邮箱或明确授权账号访问。
- 禁止公开匿名访问。
- 保留应用内登录作为第二层门禁。
- DNS 指向 Render 后，确认 HTTPS 可用。

## 4. 本地执行器

本地执行器运行在当前电脑或你控制的常在线机器上。

生产连接时设置：

```powershell
$env:AI_LINK_BASE_URL="https://voice.xiao-qi-ai.com"
$env:AI_LINK_EXECUTOR_TOKEN="<executor-token-from-secret-store>"
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
npm run auth-hub:remote:smoke
```

如果只想先确认远端健康和 API 创建任务，不启动本地执行器，可用：

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -SkipExecutor
```
