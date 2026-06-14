# v0.1 Release Readiness 报告

日期：2026-06-15

## 背景

AI Link 已具备公开仓 CLI、provider dry-run、Codex skill 示例、BWS 密钥托管路径、GitHub CI、provider-live 安全摘要和 fresh clone 验证。下一步需要一个可机器读取的发布基线报告，把仓库内可验证项和 GitHub UI / npm 发布决策等人工确认项分开。

## 本次推进

- 新增 `tools/check-release-readiness.js`。
- 新增脚本：
  - `npm run release:readiness`
  - `npm run release:readiness:json`
- CI 纳入 `npm run release:readiness`。
- `verify:fresh` 纳入 `release:readiness` 和 `release:readiness:json`。
- Onboarding 纳入 release readiness 脚本检查和 dry-run 路径。
- 公开文档说明 readiness 报告不是 npm 发布动作，只是 v0.1 公开发布基线判断。

## 报告边界

`release:readiness` 不访问网络、不读取密钥、不触发真实 provider 调用。报告包含：

- `pass`：仓库内已满足的文件、脚本、CI、文档、安全边界和示例。
- `warn`：仓库内存在但需要注意的非阻断风险。
- `fail`：仓库内缺失或不满足的发布基线。
- `manual`：需要 GitHub UI、仓库设置或产品决策确认的事项。

## 后续

在真正发 v0.1 tag 或 npm 包之前，先运行 `release:readiness:json` 获取机器可读状态，再逐项处理 `manual` 项：branch protection、secret scanning / push protection、npm 发布策略和 provider-live credentials / cost approval。
