# GitHub Repository Safety 检查

日期：2026-06-15

## 背景

AI Link 是公开 GitHub 仓库，v0.1 前需要确认 `main` 分支保护、CI 必需检查、secret scanning 和 push protection。此前仓库已有 `docs/00-governance/github-branch-protection.md` 清单，但没有统一命令能把本地治理基线和可选远端核验合在一起。

## 本次推进

- 新增 `tools/check-github-repo-safety.js`。
- 新增脚本：
  - `npm run github:safety`
  - `npm run github:safety:json`
- 检查内容：
  - 仓库目标、默认分支目标和 origin remote。
  - `SECURITY.md`、CI workflow、branch protection guide 是否存在。
  - CI 是否包含 `Verify`、类型检查、测试、安全扫描、包内容检查和 release readiness。
  - branch protection guide 是否包含 PR、status check、force push、deletion、secret scanning 和 push protection 要点。
  - 如果本机安装并登录 `gh`，只读核验远端仓库可见性、默认分支、branch protection、secret scanning 和 push protection。
- CI 中运行本地基线检查，并通过 `AI_LINK_GITHUB_SAFETY_DISABLE_REMOTE=1` 跳过远端 API。
- fresh clone、onboarding、release readiness、README、用户指南和公开仓维护规则均纳入 `github:safety`。

## 边界

`github:safety` 不修改 GitHub 设置。没有 `gh` 或未登录时，远端 UI 项输出为 `manual`，本地基线仍可通过。真正启用 branch protection、secret scanning 和 push protection 仍需 GitHub UI 或具有权限的维护者环境。

## 后续

- 在 GitHub UI 配置 `main` branch protection 或 ruleset。
- 将 `Verify` 纳入 required status checks。
- 启用公开仓和私有 companion 仓的 secret scanning / push protection。
- 配置后用已登录 `gh` 环境 rerun `npm run github:safety:json`，把 manual 项转为 pass 或明确风险。
