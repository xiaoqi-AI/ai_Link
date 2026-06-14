# 2026-06-15 BWS 临时会话入口

## 本次变化

- 新增 `tools/invoke-bws-session.ps1`，用于在当前子命令里临时设置 `AI_LINK_BWS_PROJECT_ID` 和 `BWS_ACCESS_TOKEN`。
- 新增 `npm run bws:session`，默认隐藏输入缺失的 `BWS_ACCESS_TOKEN` 并执行 `npm run bws:check:strict`。
- 新增 `npm run bws:doctor`，通过 `bws run` 注入 Bitwarden Secrets Manager 中的 provider key 后执行 `doctor`。
- fresh clone 验证纳入 `npm run bws:session:help`，确保非交互入口可用。

## 安全边界

- 脚本不打印 secret value。
- `BWS_ACCESS_TOKEN` 只允许存在于当前会话或脚本子命令环境里，不写入项目文件、Git、文档、issue、PR 或知识库。
- `AI_LINK_BWS_PROJECT_ID` 不是密钥，可以保存在本机环境变量中。

## 下一步

- 用户在 Bitwarden Secrets Manager 创建真实项目、machine account 和 secret 后，运行 `npm run bws:session` 做严格验收。
- 首次验收通过后，再运行 `npm run bws:doctor` 确认 AI Link 能通过 BWS 注入读取 provider key。
