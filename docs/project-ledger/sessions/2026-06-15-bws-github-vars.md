# 2026-06-15 BWS GitHub Variables 辅助

## 本次变化

- 新增 `tools/export-bws-github-provider-vars.ps1`。
- 新增 `npm run bws:github-vars`，从 Bitwarden CI 项目读取 secret ID，生成 GitHub `provider-live` Environment variable 填写清单。
- 新增 `npm run bws:github-vars:help`，用于无 token 的 fresh clone 验证。
- `bws:plan` 增加 `AI_LINK_BWS_CI_PROJECT_ID` 提示和 `npm run bws:github-vars` 检查入口。

## 安全边界

- 输出的是 Bitwarden secret ID，不是 secret value。
- 生成文件默认位于 `runtime/tmp/bws-github-provider-live-vars.md`，不进入 Git 或知识库镜像。
- `BWS_ACCESS_TOKEN` 仍只允许存在于当前本机会话环境中。

## 下一步

- 用户配置好 `ai-link-ci` 项目和 `ma-ai-link-github-actions` 后，设置 `AI_LINK_BWS_CI_PROJECT_ID` 并运行 `npm run bws:github-vars`。
- 将生成清单中的 secret ID 填入 GitHub `provider-live` Environment Variables。
- 用 `npm run providers:github:remote-check` 做远端名称检查。
