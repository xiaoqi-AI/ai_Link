# 2026-06-15 Provider 与 GitHub 门禁推进

## 目标

继续推进 v0.1 稳定化后的下一步：补齐真实 provider 手动验收流程和 GitHub 保护门禁说明。

## 已补充

- `ai-link providers verify`：支持 provider dry-run 与 live 验收。
- `npm run providers:dry`：默认不访问外部模型，验证所有 provider 路由和请求构造。
- `npm run providers:live`：在本机或 GitHub Actions 中尝试真实 provider 调用。
- `Provider Live Verification` 手动 GitHub workflow。
- `docs/20-architecture/provider-live-verification.md`。
- `docs/00-governance/github-branch-protection.md`。

## 边界

- 当前未配置真实 provider key，因此不会执行真实外部模型调用。
- 本机未安装 `gh`，branch protection 仍需通过 GitHub UI 或后续安装 `gh` 后配置。
- 真实 API key 只允许存在于 Bitwarden、GitHub Secrets、Render Secrets 或本机会话环境中。
