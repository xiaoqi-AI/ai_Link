# 2026-06-15 BWS 本地 CLI 推进

## 本次推进

- 按官方 Bitwarden Secrets Manager CLI 文档，从 Bitwarden SDK release 安装 `bws` 原生 Windows x64 可执行文件。
- 安装版本：`bws 2.1.0`。
- 安装位置：`%LOCALAPPDATA%\Programs\BitwardenSecretsManager\bin\bws.exe`。
- 已将安装目录写入用户 PATH；当前 Codex 桌面进程可能需要重启后才会自动继承 PATH。
- `tools/with-bitwarden-secrets.ps1` 增加默认安装目录 fallback，避免当前会话 PATH 未刷新时无法调用。
- 新增 `tools/check-bitwarden-secrets.ps1`，用于检查 `bws`、`AI_LINK_BWS_PROJECT_ID`、`BWS_ACCESS_TOKEN` 和项目访问状态。

## 当前边界

- 尚未配置真实 `BWS_ACCESS_TOKEN`。
- 尚未创建或确认 Bitwarden 项目 ID。
- 因缺少用户授权 token，未执行真实 `bws project list` 或 `bws run` 注入验证。
- 项目仍坚持：真实密钥不进入 Git、知识库、issue、PR 或聊天记录。
