# 2026-06-15 BWS 两段式激活向导

## 变更

- 新增 `tools/invoke-bws-activation.ps1`。
- 新增 `npm run bws:activate`，用于 Bitwarden / GitHub 实配完成后的交互激活。
- 新增 `npm run bws:activate:plan`，无 token 输出两段式激活计划，便于 fresh clone 和文档校验。
- BWS acceptance report 纳入 `bws:activate:plan` 检查。

## 两段 token 边界

- 第一段使用 `ma-ai-link-local-codex` token，只验收 `ai-link-local-dev`，供本地 Codex / AI Link 调用。
- 第二段使用 `ma-ai-link-github-actions` token，只读取 `ai-link-ci` 的 Bitwarden secret ID，用于生成 GitHub `provider-live` Environment variable 填写清单。
- 两个 token 都通过隐藏输入进入当前子命令环境，结束后恢复 `BWS_ACCESS_TOKEN`。

## 安全边界

- 不保存 token。
- 不输出 secret value。
- provider live 验证默认跳过，只有显式传入 `-RunProviderLive` 才会触发真实外部模型调用。

## 下一步

- 用户完成 Bitwarden 项目、machine account 和 GitHub Environment 后，运行 `npm run bws:activate`。
- 激活成功后再运行 `npm run bws:session`、`npm run bws:doctor` 和 `npm run bws:acceptance:strict` 做最终验收。
