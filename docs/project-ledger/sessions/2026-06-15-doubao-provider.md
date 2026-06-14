# 2026-06-15 Doubao Provider

## 变更

- 新增 `doubao` provider type。
- 默认配置和 `.ai-link/project.yaml` 新增火山方舟 OpenAI-compatible Chat API provider。
- 默认密钥环境变量使用 `ARK_API_KEY`，不保存真实 key。
- `auto_ops` 默认 fallback 增加豆包。
- 自然语言 skill draft 会把豆包纳入 research / article fallback，并避免 fallback 重复主 provider。
- BWS manifest 和 GitHub `provider-live` workflow 增加 `ARK_API_KEY` / `BWS_ARK_API_KEY_SECRET_ID`。

## 安全边界

- Dry-run 不访问外部网络。
- 真实调用仍受默认 `allowOutbound: user-approved` policy 控制。
- `ARK_API_KEY` 只作为环境变量名和 Bitwarden secret key 出现在公开仓，真实值不得进入 Git、issue、PR、知识库或聊天记录。
- GitHub Actions 只通过 Bitwarden secret ID 临时注入 `ARK_API_KEY`。

## 验证

- `npm run ai-link -- config validate`
- `npm run providers:dry`
- `npm test`
- `npm run security:scan`
- `npm run providers:github:check`
- `npm run bws:github-vars:apply-plan`

## 下一步

- 用户完成火山方舟 API key 配置后，可用 `npm run ai-link -- providers verify --live --provider doubao` 做单 provider 验收。
- 后续可评估是否增加火山方舟 Responses API、工具调用或多模态能力。
