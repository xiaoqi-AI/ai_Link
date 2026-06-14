# 2026-06-15 Provider Live Dispatch and Doubao

## 变更

- 新增 `doubao` provider type。
- 默认配置和 `.ai-link/project.yaml` 新增火山方舟 OpenAI-compatible Chat API provider。
- 默认密钥环境变量使用 `ARK_API_KEY`，不保存真实 key。
- `auto_ops` 默认 fallback 增加豆包。
- 自然语言 skill draft 会把豆包纳入 research / article fallback，并避免 fallback 重复主 provider。
- BWS manifest 和 GitHub `provider-live` workflow 增加 `ARK_API_KEY` / `BWS_ARK_API_KEY_SECRET_ID`。
- 新增 `tools/invoke-provider-live-workflow.ps1`，用于 GitHub `provider-live` workflow 调度。
- 新增 `providers:github:dispatch-plan` 作为默认无凭据预览。
- 新增受保护的触发命令：`providers:github:dispatch` 和 `providers:github:dispatch-strict`。

## 安全边界

- dry-run 和 dispatch plan 都不会访问外部 provider。
- 真实 provider 调用仍受默认 `allowOutbound: user-approved` policy 控制。
- 真正触发 GitHub workflow 必须有当前会话 `GH_TOKEN` / `GITHUB_TOKEN`，并显式确认成本。
- `ARK_API_KEY` 只作为环境变量名和 Bitwarden secret key 出现在公开仓，真实值不得进入 Git、issue、PR、知识库或聊天记录。
- 调度脚本不读取、不写入、不打印 Bitwarden secret 或 provider API key。
- GitHub Actions 只通过 Bitwarden secret ID 临时注入 provider key。

## 验证

- `npm run ai-link -- config validate`
- `npm run providers:dry`
- `npm run providers:github:check`
- `npm run providers:github:dispatch-plan`
- `npm run bws:github-vars:apply-plan`
- `npm run bws:acceptance:print`
- `npm test`
- `npm run security:scan`
- `npm run verify:fresh`

## 下一步

- 用户完成火山方舟 API key 配置后，可用 `npm run ai-link -- providers verify --live --provider doubao` 做单 provider 验收。
- 配好 GitHub `provider-live` Environment 后，先运行 `npm run providers:github:remote-check` 和 `npm run bws:acceptance:strict`。
- 后续可评估是否增加火山方舟 Responses API、工具调用或多模态能力。
