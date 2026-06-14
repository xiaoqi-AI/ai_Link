# 2026-06-15 Skill Draft 安全写入

## 本次推进

- `ai-link skill draft` 新增 `--write <path>`，可把自然语言生成的 route + workflow 草稿合并到配置文件。
- 默认只预览，不写文件；必须加 `--yes` 才会落盘。
- `--write` 仅允许 `.ai-link/local.yaml` 或 `.ai-link/project.yaml`，避免误写任意路径。
- 写 `.ai-link/project.yaml` 需要额外加 `--allow-public-config`，默认推荐写 `.ai-link/local.yaml`。
- CLI 集成测试覆盖预览不写、local 写入和公开配置保护。
- fresh clone 验证新增 `--write` 预览命令。

## 安全边界

- 该能力只写公开结构化配置，不写 API key、token、账号、私有 endpoint 或登录态。
- `.ai-link/local.yaml` 不进入 Git，适合用户本机或项目私有覆盖。
- `.ai-link/project.yaml` 是公开配置，只有明确使用 `--allow-public-config` 才允许写入。

## 后续建议

- 后续可加 `--diff` 输出变更摘要，帮助用户确认合并结果。
- 后续可加 `--dry-run-write` 或交互确认，但当前 CLI 先保持非交互、可自动化。
