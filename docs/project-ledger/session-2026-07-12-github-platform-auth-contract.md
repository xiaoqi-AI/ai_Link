# 2026-07-12 GitHub 平台授权检查合同

## 背景

平台授权连接器 P0.2 的目标是让小红书、公众号、GitHub 等真实平台接入同一套 Auth Hub 状态中枢。PR #16 与 PR #17 已经让 Auth Hub 能输出跨项目行动清单，本次补齐 GitHub 的最小授权健康检查合同。

## 本次增量

- 新增公开 mock `github` connector。
- `GET /api/connectors` 中新增 `github/check_auth` 能力。
- `platform_auth_collect` 支持：

```json
{
  "platform": "github",
  "operation": "check_auth",
  "owner": "xiaoqi-AI",
  "repo": "ai_Link",
  "scope": "repo_read"
}
```

- `scope` 仅允许：
  - `repo_read`
  - `actions_read`
  - `pull_request_read`
- 私有连接器可以通过 `github.checkAuth()` 注入真实 GitHub 授权健康检查。
- GitHub 凭据缺失会映射为 `credential_missing`，并在 `authStatus.nextActions` 中指向 `secret_owner`。

## 边界

- 不保存、不读取、不输出 GitHub token、GitHub App private key、`gh` 登录态、Cookie、账号详情或原始 API 响应。
- 不自动修改 GitHub 设置。
- 不合并 PR。
- 不触发 provider-live workflow。
- 不替代 GitHub App 或仓库保护配置。

## 对主目标的推进

- 模块 2：Auth Hub 状态中枢能统一表达 GitHub 授权问题。
- 模块 5：平台授权连接器 P0.2 增加 GitHub 最小合同位。
- 模块 6：远程化后，外部项目可以通过 `/api/auth-status` 或 `auth-hub:status` 读取 GitHub 授权行动清单，而不接触真实凭据。
