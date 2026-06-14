# 2026-06-14 Bitwarden 密钥托管模式

## 背景

用户确认采用 Bitwarden Free + Bitwarden Secrets Manager Free 作为第一阶段密钥管理方案，用于管理个人密码、网站链接、API key、自动化 token，并支持 Codex / AI Link 在正常工作流中安全调用。

## 本次决策

- 个人密码、网站链接、恢复码和账号资料放 Bitwarden Password Manager。
- API key、token 和自动化凭据放 Bitwarden Secrets Manager。
- 本地 Codex / AI Link 只通过 `bws run` 临时注入环境变量。
- GitHub Actions 只保存 `BW_ACCESS_TOKEN`，真实 API key 仍由 Bitwarden Secrets Manager 托管。
- 公开仓、知识库、issue、PR 和聊天记录只允许出现环境变量名，不允许出现真实密钥值。

## 落地内容

- 新增 `docs/20-architecture/bitwarden-secret-management.md` 作为完整 runbook。
- 更新 `docs/20-architecture/configuration.md`，把 BWS 模式设为首选密钥管理方式。
- 更新 `docs/user-guide.md` 和 `README.md`，补充用户入口。
- 新增 `tools/with-bitwarden-secrets.ps1`，封装 `bws run --project-id ... -- <command>`。

## 验证边界

- 包装脚本只读取当前会话里的 `BWS_ACCESS_TOKEN`，不写入项目文件。
- `AI_LINK_BWS_PROJECT_ID` 是非敏感项目 ID，可作为本机环境变量保存。
- 真实外部模型调用可能产生费用，默认先用 `doctor` 和 `--dry-run` 验证。
