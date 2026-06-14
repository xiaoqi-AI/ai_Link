# 2026-06-15 Release Manual Gates

## 背景

v0.1 发布就绪检查已经能区分仓库内自动检查和 GitHub UI / npm / provider-live 这类人工确认项，但人工项还缺少统一的 owner、动作和完成证据清单。为了继续推进 Bitwarden / GitHub / 发布治理落地，本次补充只读的人工门槛计划入口。

## 改动

- 新增 `tools/show-release-manual-gates.js`。
- 新增脚本：
  - `npm run release:manual-gates`
  - `npm run release:manual-gates:json`
- 人工门槛覆盖：
  - GitHub branch protection 和 `Verify` required check。
  - secret scanning / push protection。
  - npm publish 决策。
  - provider-live 凭据与成本审批。
- 接入发布流程、release readiness、fresh clone、onboarding、README、用户指南、v0.1 release 草稿和治理文档。
- 新增 `tests/release-manual-gates.test.js`，固定 JSON 和 Markdown 输出。

## 安全边界

`release:manual-gates` 只输出计划，不读取 API key、token、`.env`、GitHub Secret、Bitwarden secret value 或 provider response；也不会修改 GitHub 设置、创建 tag、发布 npm 包或触发真实 provider live 调用。

## 后续

- 维护者在 GitHub UI 或已登录 `gh` 环境中完成 branch protection、secret scanning 和 push protection 后，运行 `npm run github:safety:json` 验收。
- npm 发布仍需明确 owner、包权限、dry-run 结果和 rollback policy。
- provider-live 仍需完成 Bitwarden / GitHub Environment 实配，并在确认模型费用边界后运行严格验收。
