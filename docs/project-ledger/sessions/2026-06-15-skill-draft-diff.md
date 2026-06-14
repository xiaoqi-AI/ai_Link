# 2026-06-15 Skill Draft Diff Preview

## 本次推进

- `ai-link skill draft --write <path>` 新增 `--diff`，用于在写入前查看合并摘要。
- 摘要会列出本次草稿在 `routes`、`workflows`、`policies` 中将新增或更新的键。
- `--diff` 需要配合 `--write` 使用，因为它必须知道要和哪个配置文件比较。
- 未加 `--yes` 时仍只预览、不写文件；加 `--yes` 后写入并打印同一份摘要。
- fresh clone 验证脚本已加入 `--diff` 预览命令，覆盖公开用户克隆后的基础路径。

## 安全边界

- `--diff` 不读取或输出 provider API key、token、账号或登录状态。
- 摘要只基于结构化配置键名，不展示外部模型返回内容。
- `.ai-link/project.yaml` 仍需要 `--allow-public-config` 才允许写入。

## 后续建议

- 后续如需要机器可读输出，可为 `skill draft --write --diff --json` 增加结构化摘要。
- 如果 skill 配置变复杂，可以把当前键级摘要升级为字段级差异，但第一版先保持可读、稳定、低风险。
