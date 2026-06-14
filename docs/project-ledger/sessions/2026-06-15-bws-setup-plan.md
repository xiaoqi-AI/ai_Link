# 2026-06-15 BWS 设置计划入口

## 本次变化

- 新增 `tools/show-bws-setup-plan.ps1`，从 `.ai-link/bitwarden-secrets.manifest.json` 生成 BWS 设置清单。
- 新增 `npm run bws:plan`，输出需要创建的 Bitwarden 项目、machine account、secret key、GitHub Environment Secret 和 GitHub variables。
- `tools/verify-fresh-clone.js` 纳入 `npm run bws:plan`，确保外部 fresh clone 也能看到同一份设置清单。

## 安全边界

- `bws:plan` 只输出公开名称和占位符，不输出真实 secret value。
- 真实 `BWS_ACCESS_TOKEN`、`BW_ACCESS_TOKEN` 和 provider API key 仍只能放在本机会话环境、GitHub Environment Secret 或 Bitwarden Secrets Manager 中。
- 设置清单可以写入公开文档；真实值不能写入 Git、issue、PR、知识库或聊天记录。

## 后续使用

1. 先运行 `npm run bws:plan`，按清单创建 Bitwarden / GitHub 侧资源。
2. 在本机会话设置 `AI_LINK_BWS_PROJECT_ID` 和 `BWS_ACCESS_TOKEN`。
3. 运行 `npm run bws:check:strict` 做正式验收。
4. 如需真实模型调用，在确认费用边界后再运行 BWS 注入命令或 `tools/check-bws-mode.ps1 -RunProviderLive`。
