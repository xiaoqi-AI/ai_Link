# 2026-06-15 BWS 验收报告入口

## 本次变化

- 新增 `tools/new-bws-acceptance-report.ps1`。
- 新增 `npm run bws:acceptance`，默认生成 `runtime/tmp/bws-acceptance-report.md`。
- 新增 `npm run bws:acceptance:print`，用于无文件输出地查看当前验收状态。
- 新增 `npm run bws:acceptance:strict`，用于 Bitwarden / GitHub 实配完成后的正式验收。

## 验收范围

- 本地 `bws` CLI、`AI_LINK_BWS_PROJECT_ID`、`AI_LINK_BWS_CI_PROJECT_ID` 和当前会话 token 是否就绪。
- GitHub `provider-live` workflow 是否仍通过 Bitwarden Secrets Manager 注入密钥。
- BWS GitHub variable ID helper 是否可用。
- `external_action` policy 是否在 dry-run 中只提示、在 live 运行中阻断未批准动作。
- 公开配置安全扫描和 Git 工作区状态。

## 安全边界

- 报告只写入 `runtime/tmp/`，不进入 Git 或知识库镜像。
- 报告不打印 secret value；bootstrap token 只显示 present / missing。
- 真实 provider live 验收默认跳过，只有显式传入 `-RunProviderLive` 才会执行。

## 下一步

- 用户完成 Bitwarden 和 GitHub Environment 实配后，运行 `npm run bws:acceptance:strict`。
- 若要做真实外部模型调用，先确认费用边界，再运行带 `-RunProviderLive` 的验收命令。
