# 2026-06-15 Next Actions Report

## 背景

BWS 验收、GitHub 安全检查、发布计划和人工门槛已经分别可运行，但接手者仍需要在多个报告之间来回判断下一步。为了把“继续推进”的路线收敛到一个入口，本次新增统一的下一步行动图。

## 改动

- 新增 `tools/show-next-actions.js`。
- 新增脚本：
  - `npm run next:actions`
  - `npm run next:actions:json`
- 行动图覆盖：
  - 保持本地基线绿色。
  - GitHub branch protection、secret scanning、push protection。
  - Bitwarden Secrets Manager 项目、machine account 和本地 BWS 严格验收。
  - GitHub provider-live Environment。
  - provider-live 成本审批。
  - v0.1 release channel 决策。
- 接入 CI、fresh clone、onboarding、release readiness、README、用户指南、quickstart、release process 和 release notes。

## 安全边界

`next:actions` 只读输出行动、owner、证据和命令，不读取 API key、token、`.env`、GitHub Secret、Bitwarden secret value、provider response 或 `runtime/private/`；也不会修改 GitHub 设置、创建 tag、发布 npm、写 Bitwarden secret 或触发 provider live。

## 后续

- 配好真实 Bitwarden / GitHub 外部状态后，优先运行 `npm run next:actions` 确认剩余动作，再运行对应严格验收。
- 若 v0.1 发布策略确认，可把 `decide-v0-1-release-channel` 的结果沉淀为 release decision record。
