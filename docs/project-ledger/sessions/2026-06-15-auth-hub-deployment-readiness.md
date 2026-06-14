# 2026-06-15 授权中枢部署验收推进

## 目标

把 Render + Cloudflare Access 部署前后检查从人工清单推进为可执行脚本，为远端内测和后续真实平台连接器做准备。

## 已实现

- 新增部署前检查脚本：`tools/check-auth-hub-deployment.ps1`。
- 新增远端部署验收脚本：`tools/test-auth-hub-remote.ps1`。
- 新增 npm 命令：`auth-hub:deploy:check`、`auth-hub:remote:smoke`。
- 更新 README、用户指引和授权中枢部署检查清单。

## 验收重点

- 检查 `render.yaml` 是否包含关键环境变量和 `/healthz` 健康检查。
- 检查生产模式是否缺少强随机环境变量或仍使用开发默认值。
- 远端验收支持健康检查、登录页/Access 门禁探测、API 创建任务和本地执行器回传。

## 风险边界

- 脚本不会打印真实 secret 值。
- Cloudflare Access 是否配置正确仍需要用户在 Cloudflare 控制台人工确认；脚本只记录确认标记和远端行为。
- 真实平台账号连接器仍未接入。
