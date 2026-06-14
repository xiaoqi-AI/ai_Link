# 2026-06-15 BWS 模式总检查

## 本次变化

- 新增 `tools/check-bws-mode.ps1`，聚合本地 Bitwarden Secrets Manager、GitHub provider-live workflow、公开配置安全扫描和治理文件检查。
- 新增 `npm run bws:check`，默认给出可行动状态报告；没有真实 token 或项目 ID 时只给 warning。
- 新增 `npm run bws:check:strict`，用于 Bitwarden 项目、machine account token 和 GitHub Environment 配置完成后的正式验收。
- `tools/verify-fresh-clone.js` 纳入 `npm run bws:check`，确保新入口在干净克隆中可运行。

## 安全边界

- 总检查不会打印 secret value。
- 默认不触发真实 provider live 调用，避免未确认的外部模型费用。
- 如需真实调用，必须显式运行 `tools/check-bws-mode.ps1 -RunProviderLive`，并先确认费用和账号边界。

## 当前状态

- 本机已能找到 `bws 2.1.0`。
- 当前会话尚未设置 `AI_LINK_BWS_PROJECT_ID` 和 `BWS_ACCESS_TOKEN`，因此本地 BWS readiness 仍是 warning。
- GitHub provider-live workflow 结构检查、公开配置安全扫描和治理文件检查通过。

## 下一步

- 用户在 Bitwarden Secrets Manager 创建 `ai-link-local-dev` 项目和 `ma-ai-link-local-codex` 只读 machine account。
- 仅在本机会话设置 `AI_LINK_BWS_PROJECT_ID` 和 `BWS_ACCESS_TOKEN` 后运行 `npm run bws:check:strict`。
- 配好 GitHub `provider-live` Environment 后，用 `npm run providers:github:remote-check` 或 `tools/check-bws-mode.ps1 -CheckRemote` 检查远端 secret / variable 名称。
