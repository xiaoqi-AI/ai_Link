# 2026-06-15 BWS GitHub Vars Apply

## 变更

- 新增 `tools/apply-bws-github-provider-vars.ps1`。
- 新增 `npm run bws:github-vars:apply-plan`、`npm run bws:github-vars:apply` 和 `npm run bws:github-vars:apply-help`。
- BWS setup plan、onboarding runbook、acceptance report 和 fresh clone 验证纳入 apply plan。
- README、用户指引和 Bitwarden 密钥托管文档补充 GitHub Environment variable 自动写入入口。

## 安全边界

- 默认 plan 模式不需要凭据、不写远端。
- apply 模式需要当前会话里的 `BWS_ACCESS_TOKEN` 和 `GH_TOKEN` / `GITHUB_TOKEN`。
- 脚本只读取 Bitwarden secret ID，只写 GitHub Environment Variables。
- 脚本不读取、不输出 provider secret value，也不创建或更新 `BW_ACCESS_TOKEN` Environment Secret。

## 验证

- `npm run bws:github-vars:apply-plan`
- `npm run bws:acceptance:print`
- `npm run security:scan`

## 下一步

- 用户完成 Bitwarden CI 项目和 GitHub token 准备后，先跑 plan，再显式运行 apply。
- apply 后用 `npm run providers:github:remote-check` 确认远端变量名和 secret 名称。
