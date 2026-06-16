# 2026-06-16 Auth Hub 远端 Mock 空跑闭环

## 背景

本轮目标是让 `voice.xiao-qi-ai.com` 对应的远端授权中枢具备可验证的 mock 空跑能力。边界是只验证控制台、任务 API、审批流、审计日志、本地执行器与远端服务的基础链路，不接入真实微信、朱雀AI、抖音、小红书、知乎、头条账号，也不实现正式发布。

## 本次推进

- 增强 `tools/test-auth-hub-remote.ps1`，默认用 `full_chain` mock 任务覆盖任务创建、执行器领取、审批前停止、管理 token 审批、审批后二次执行、任务完成、连接器状态、Codex token 权限边界、脱敏任务详情和审计日志。
- 让本地执行器可携带 Cloudflare Access 测试 JWT / 邮箱头，便于直连受 Access origin guard 保护的测试环境。
- 更新 `README.md`、`docs/user-guide.md`、`docs/20-architecture/auth-hub.md` 和 `docs/20-architecture/auth-hub-deployment-checklist.md`，明确远端 mock 空跑命令、验证覆盖面和安全边界。

## 当前验证

- 本地 Auth Hub 启动在 `http://127.0.0.1:10001` 后，使用增强版远端 smoke 脚本通过完整 mock 闭环。
- 当前机器访问 `https://voice.xiao-qi-ai.com/healthz` 超时，尚不能证明生产域名已部署可用。

## 人工协助项

- 在 Render 配置 Web Service、Postgres 和生产环境变量。
- 在 Cloudflare Access 配置 `voice.xiao-qi-ai.com` 的授权邮箱范围、AUD tag、team domain 或 issuer。
- 为本地执行器配置 Cloudflare Access Service Auth 凭据。
- 在当前终端或 secret manager 临时注入生产 `AI_LINK_ADMIN_TOKEN`、`AI_LINK_EXECUTOR_TOKEN`、`AI_LINK_CODEX_TOKEN` 和 `AI_LINK_APP_PASSWORD` 后运行 `npm run auth-hub:remote:smoke`。

## 边界

- 不把 `.env`、token、Cloudflare 凭据、数据库连接串、Cookie、浏览器 Profile、二维码、截图、原始平台内容或 `runtime/private/` 写入公开仓或知识库。
- `auth-hub:remote:smoke` 只证明 mock 链路可用；真实平台连接器和正式发布仍需后续单独边界卡与人工确认。
