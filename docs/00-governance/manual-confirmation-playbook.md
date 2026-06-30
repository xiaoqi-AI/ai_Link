# 人工门禁推进手册

状态：L1 / L2 人工确认事项的当前交接手册。

本手册用于说明 Codex 不能单独关闭的人工门禁：项目背景、当前进度、需要你确认的事项、可选决策、推荐决策，以及确认后应记录的公开安全证据。本文档可以进入公开仓；不要写入 API key、token、Bitwarden 值、provider 原始响应、截图、二维码、登录态、账号私密内容或 `runtime/private/` 路径。

## 项目背景

AI Link 是公开 GitHub 项目，目标是让 Codex 能按任务链路连接合适的模型、Agent 和工作流。当前 v0.1 是本地优先 MVP，已经具备 TypeScript / Node.js CLI、公开配置、mock / dry-run provider、workflow dry-run、release readiness 检查、GitHub hardening 报告、Bitwarden Secrets Manager 规划，以及 Auth Hub mock 骨架。

项目默认分为公开边界和私有边界：

- 公开仓：代码、mock 行为、dry-run 检查、公开文档、脱敏治理证据。
- 私有/内部边界：真实密钥、登录态、provider 原始响应、浏览器 profile、截图、二维码、平台账号数据、未公开内部计划。

当前阶段的实际目标是：保持 v0.1 公开本地基线稳定，同时在创建 tag、GitHub Release、npm publish、provider-live dispatch 或真实 connector 前，逐项关闭或明确 defer 外部人工门禁。

## 当前进度

截至 2026-06-30：

- 公开仓：`xiaoqi-AI/ai_Link`。
- 默认分支：`main`。
- 本手册更新前，本地公开仓工作区为干净状态。
- `npm.cmd run github:safety:json` 已可使用已登录的 `gh` 做远端只读检查。
- 公开仓 secret scanning：已启用。
- 公开仓 push protection：已启用。
- 公开仓 `main` 分支保护：尚未配置；GitHub API 返回 branch not protected。
- 私有 companion 仓 `xiaoqi-AI/ai_Link-internal`：可访问，且为 private。
- 私有 companion 仓 secret scanning / push protection：本轮 API 未返回状态，需要你在 GitHub UI 确认。
- Bitwarden Secrets Manager CLI：当前会话不可用。
- BWS manifest：已存在，且只包含公开安全结构。
- v0.1 release decisions：仍在 `docs/releases/v0.1.0-decisions.json` 中 pending。

## 推荐推进顺序

1. 先配置公开仓 `main` branch protection 或 repository ruleset。
2. 再确认公开仓和私有仓 secret scanning / push protection。
3. 决定 v0.1 release channel。
4. 只有当下一步要做真实 provider 检查时，才安装或暴露 BWS CLI，并先配置 local-dev BWS。
5. provider-live dispatch 等 BWS 和成本边界明确后再做。
6. Auth Hub 远端 mock dry-run 和真实 connector 保持为后续独立门禁。

## 门禁 1：公开仓 main 分支保护

### 背景

公开仓已经有 CI 和 `Verify` job。没有 branch protection 或 ruleset 时，GitHub 仍不会强制 `main` 必须通过 `Verify` 后才能变更。

### 当前状态

远端只读检查显示：公开仓 secret scanning 和 push protection 已启用，但 `main` 分支保护缺失。

### 需要你做的事

在 GitHub UI 中，为 `main` 配置 repository ruleset 或 branch protection：

- 仓库：`xiaoqi-AI/ai_Link`
- 目标分支：`main`
- 要求 status checks 通过。
- required check：`Verify`
- 禁止 force push。
- 禁止删除分支。
- 当项目开始接收外部贡献时，要求 PR 后合并。
- 如希望 release gate 更严格，可要求分支在合并前保持最新。

GitHub UI 入口：

- `https://github.com/xiaoqi-AI/ai_Link/settings/rules`
- `https://github.com/xiaoqi-AI/ai_Link/settings/branches`

### 决策选项

- 配置 ruleset / branch protection 后批准该门禁。
- 如果 v0.1 只保持 repository-local，且不创建 tag、不发 GitHub Release、不发 npm、不声明 live-provider 验证，可以临时 waiver。
- 如果暂时不配置，则保持 pending / blocked。

### 决策建议

建议配置 `main` protection，并要求 `Verify`。这是当前最值得优先关闭的门禁：不引入真实密钥、不产生费用、不扩大产品范围，却能为后续 release 决策打好安全基线。

### 可记录的公开安全证据

可以写：

- `Repository maintainer confirmed main branch protection or ruleset requires Verify.`
- `npm.cmd run github:safety:json reported GitHub branch protection and required Verify as pass.`

不要附截图，也不要导出账号私密设置。

## 门禁 2：Secret scanning 和 push protection

### 背景

AI Link 后续会涉及 provider key、Bitwarden bootstrap token、GitHub Environment secret，以及真实 connector 凭据。GitHub 侧扫描能降低密钥进入公开仓或内部 companion 仓的风险。

### 当前状态

公开仓：

- Secret scanning：已启用。
- Push protection：已启用。

私有 companion 仓：

- 仓库可访问，且为 private。
- 本轮 API 未返回 secret scanning / push protection 状态，需要你在 GitHub UI 中确认。

### 需要你做的事

在 GitHub UI 中确认：

- 公开仓：`https://github.com/xiaoqi-AI/ai_Link/settings/security_analysis`
- 私有仓：`https://github.com/xiaoqi-AI/ai_Link-internal/settings/security_analysis`

确认或启用：

- Secret scanning。
- Push protection。

### 决策选项

- 公开仓和私有仓都确认后批准该门禁。
- 如果只确认了公开仓，先保持 pending。
- 如果 v0.1 只保持 repository-local，可以 waiver，但必须说明 tag、npm publish、provider-live claim 仍然 blocked。

### 决策建议

建议在确认私有 companion 仓后再批准。公开仓已经满足要求，这个门禁现在主要差私有仓 UI 侧确认。

### 可记录的公开安全证据

可以写：

- `Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo.`
- `Public repo github:safety check reported secret scanning and push protection as enabled.`

不要用提交真假 secret 的方式测试扫描。

## 门禁 3：v0.1 发布渠道

### 背景

v0.1 代码已经能作为本地 MVP 使用，但 GitHub Release 或 npm publish 会形成外部承诺。npm publish 还需要确认 npm 账号、包所有权、回滚策略和最终包内容。

### 当前状态

发布渠道尚未决定，release decisions 仍为 pending。

### 决策选项

- `repository-local`：v0.1 只保持 GitHub 仓库本地使用，不创建 tag、不发 GitHub Release、不发 npm。
- `github-release`：创建 `v0.1.0` GitHub Release，但不发 npm。
- `npm-public`：在 dry-run 和所有权确认后发布 `@xiaoqi-ai/ai-link` 到 npm。

### 决策建议

建议当前选择 `repository-local`。v0.1 的价值主要是本地 MVP、治理流程、mock / dry-run 和 release readiness。保持 repository-local 可以避免过早承担 npm 支持成本，同时等待 GitHub hardening、BWS、provider-live 和 Auth Hub 门禁更稳定。

### 可记录的公开安全证据

可以写：

- `Release owner selected repository-local after package smoke checks and manual gate review.`

## 门禁 4：Bitwarden Secrets Manager

### 背景

BWS 是后续承载真实 provider 凭据和 GitHub provider-live wiring 的推荐路径。公开仓只保存名称、预期项目结构和辅助脚本，绝不保存真实 secret value。

### 当前状态

- BWS manifest 已存在。
- 预期项目：
  - `ai-link-local-dev`
  - `ai-link-ci`
- 预期 GitHub Environment：
  - `provider-live`
- 当前会话没有可用的 BWS CLI。
- `AI_LINK_BWS_PROJECT_ID`、`AI_LINK_BWS_CI_PROJECT_ID` 和 `BWS_ACCESS_TOKEN` 未设置。

### 需要你做的事

如果下一步要做真实 provider 检查：

- 安装或暴露 BWS CLI。
- 先创建或确认 local-dev BWS 项目。
- `BWS_ACCESS_TOKEN` 只放在当前 shell session 或隐藏输入流程里。
- 不要把 token 值写入项目文件、文档、issue、PR 或聊天。

### 决策选项

- 暂缓 BWS，继续只做 dry-run。
- 只配置 local-dev BWS。
- 同时配置 local-dev 和 CI provider-live BWS。

### 决策建议

如果你想验证真实 provider readiness，建议先只配置 local-dev。CI provider-live 等 branch protection、release channel 和成本边界明确后再接。

## 门禁 5：Provider-live 凭据与成本

### 背景

Provider-live 会向外部模型 provider 发送 prompt，并可能产生费用；一旦我们公开声明 live verification passed，也会形成外部可信度承诺。

### 当前状态

Provider-live 仍被 BWS 未配置和成本边界未确认阻塞。

### 需要你做的事

任何 live check 前，必须明确：

- 选择哪些 provider。
- 允许发送什么 outbound prompt 内容。
- 最大费用上限是多少。
- 只保存脱敏 safe report，不保存原始响应。

### 决策选项

- 对 repository-local v0.1 waiver provider-live，不做 live-provider claim。
- BWS local-dev 就绪后，批准一次最小 live provider check。
- CI BWS 就绪后，再批准 GitHub Actions provider-live。

### 决策建议

建议 v0.1 repository-local 阶段先 waiver provider-live，不声明 live provider verification。后续等 BWS local-dev 配好，再跑一次最小化 safe report。

## 门禁 6：Auth Hub 远端 mock dry-run

### 背景

Auth Hub 后续可以提供远端任务控制台和审批回路。即使只是 mock 远端部署，也会触及 Render、Cloudflare Access、app token、数据库设置和域名配置。

### 当前状态

仓库已有本地和远端辅助脚本，但远端部署仍属于人工门禁。

### 决策选项

- 继续保持 Auth Hub local-first。
- 部署 Cloudflare Access 后面的远端 mock dry-run。
- 进入真实 connector 方向。

### 决策建议

建议把 Auth Hub 远端部署留作单独下一轮，不要和 GitHub hardening、BWS setup、release channel 决策混在同一轮推进。

## 决策记录命令

先预览：

```powershell
npm.cmd run release:decisions:next
```

你完成对应 GitHub UI / 发布渠道 / provider-live 决策确认后，再执行带 `--yes` 的写入命令。推荐顺序：

```powershell
npm.cmd run release:decisions:update -- --id "github-branch-protection" --status "approved" --evidence "Repository maintainer confirmed main branch protection or ruleset requires Verify." --yes
npm.cmd run release:decisions:update -- --id "github-secret-scanning" --status "approved" --evidence "Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo." --yes
npm.cmd run release:decisions:update -- --id "npm-publish-decision" --status "approved" --selected-channel "repository-local" --evidence "Release owner selected repository-local after package smoke checks and manual gate review." --yes
npm.cmd run release:decisions:update -- --id "provider-live-credentials" --status "waived" --note "Release owner waived provider-live verification for repository-local v0.1; do not claim live provider verification." --yes
```

写入后验证：

```powershell
npm.cmd run release:decisions:json
npm.cmd run release:readiness:json
npm.cmd run github:safety:json
```

只有在对应人工确认已经真实完成后，才执行写入命令。
