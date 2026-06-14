# 2026-06-15 BWS 实配工作单

## 本次变化

- 新增 `tools/new-bws-setup-worksheet.ps1`，从 `.ai-link/bitwarden-secrets.manifest.json` 生成本地实配工作单。
- 新增 `npm run bws:worksheet`，默认写入 `runtime/tmp/bws-setup-worksheet.md`。
- 新增 `npm run bws:worksheet:print`，只打印工作单内容，不写文件。
- fresh clone 验证纳入 `npm run bws:worksheet`，确保入口可用。

## 安全边界

- 工作单只包含项目名、machine account 名、secret key 名、GitHub Environment Secret / variable 名和检查命令。
- 工作单不包含真实 secret value。
- 输出路径限制在 `runtime/tmp/`，该目录被 Git 忽略，不进入公开仓或知识库镜像。

## 下一步

- 用户按工作单在 Bitwarden / GitHub UI 中逐项配置。
- 配置后运行 `npm run bws:session` 和 `npm run bws:doctor` 验证本地 Codex / AI Link 能读取 provider key。
