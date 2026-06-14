# 2026-06-15 授权中枢运维化推进

## 目标

在公开 MVP 骨架基础上推进下一步：让授权中枢具备本地一键启动、常驻执行器、状态心跳和部署前检查流程。

## 已实现

- 本地控制台启动/停止脚本：`tools/start-auth-hub-local.ps1`、`tools/stop-auth-hub-local.ps1`。
- 本地执行器启动/停止脚本：`tools/start-auth-hub-executor.ps1`、`tools/stop-auth-hub-executor.ps1`。
- 端到端烟测脚本：`tools/test-auth-hub-flow.ps1`。
- 执行器写入本地心跳状态：`runtime/tmp/auth-hub-executor.json`。
- 新增 npm 脚本：`auth-hub:local:start`、`auth-hub:local:stop`、`auth-hub:executor:start`、`auth-hub:executor:stop`、`auth-hub:smoke`。
- 新增部署检查清单：`docs/20-architecture/auth-hub-deployment-checklist.md`。

## 风险边界

- 脚本默认使用本地开发 token，仅适合本机试跑。
- 生产环境必须改用强随机值、Cloudflare Access 和 Render/Bitwarden 等密钥托管。
- 高价值平台登录态仍只应保存在本地私有目录，不进入 Render 和公开仓。
