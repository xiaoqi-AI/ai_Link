# v0.1 Release Plan

日期：2026-06-15

## 背景

AI Link 已有 release readiness、package contents、GitHub safety 和 fresh clone 检查，但 v0.1 真正发布前还缺少 changelog、GitHub Release 草稿、tag 流程和 npm 发布决策的统一检查入口。

## 本次推进

- 新增 `CHANGELOG.md`，记录 v0.1.0 public MVP 的用户可见变化、安全边界和待确认决策。
- 新增 `docs/releases/v0.1.0.md`，作为 GitHub Release body 草稿。
- 新增 `docs/00-governance/release-process.md`，明确 local gate、manual gate、tag、GitHub Release 和 npm publish 边界。
- 新增 `tools/check-release-plan.js`。
- 新增脚本：
  - `npm run release:plan`
  - `npm run release:plan:json`
- `release:plan` 检查：
  - package version、license、bin、CHANGELOG 是否纳入包。
  - changelog、release draft、release process、open questions 和工具脚本是否存在。
  - release 文档是否包含 local gate、manual gate、tag 和 npm dry-run 说明。
  - `v0.1.0` tag 是否已创建，未创建时标记为 `manual`。
  - npm publish、GitHub Release 和 provider-live final approval 是否仍需人工确认。
- CI、fresh clone、onboarding、release readiness、README、用户指南和公开仓维护规则均纳入 release plan。

## 边界

`release:plan` 不创建 Git tag，不发布 GitHub Release，不发布 npm 包，不访问真实 provider，也不读取密钥。它只把发布准备状态变成可读报告。

## 后续

- 用户确认是否发布 npm 包，或 v0.1 继续保持 repository-local。
- GitHub UI 配置 branch protection、secret scanning 和 push protection。
- 如果决定发 v0.1：在所有 local gate 和 manual gate 通过后创建 `v0.1.0` tag，并使用 `docs/releases/v0.1.0.md` 发布 GitHub Release。
