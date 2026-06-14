# 2026-06-15 GitHub Provider Live BWS 检查

## 本次推进

- 扩展 `.ai-link/bitwarden-secrets.manifest.json`，记录 `provider-live` GitHub Environment 的 bootstrap secret 和 Bitwarden secret ID variable 映射。
- 新增 `tools/check-github-provider-live.ps1`，本地检查 `Provider Live Verification` workflow 是否遵守 BWS 模式。
- 新增 `npm run providers:github:check`，并纳入 `npm run verify:fresh`。

## 安全边界

- 检查脚本只读取公开 manifest 和 workflow，不读取、不请求、不打印任何真实 secret value。
- GitHub Actions 仍只保存 `BW_ACCESS_TOKEN`；真实 provider API key 留在 Bitwarden Secrets Manager。
