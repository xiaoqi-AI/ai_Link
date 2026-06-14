# 2026-06-15 Skill Draft JSON Output

## 本次推进

- `ai-link skill draft --write <path> --json` 现在会输出机器可读对象。
- 配合 `--diff` 时，JSON 中包含 `diff.routes`、`diff.workflows` 和 `diff.policies` 的 `added` / `updated` 摘要。
- 未加 `--yes` 时输出 `previewOnly: true`、`merged: false`，并保持不写文件。
- 加 `--yes` 后输出 `previewOnly: false`、`merged: true`，同时完成配置合并写入。
- fresh clone 验证已改为覆盖 `skill draft --write --diff --json`。

## 输出契约

```json
{
  "target": ".ai-link/local.yaml",
  "previewOnly": true,
  "merged": false,
  "draft": {},
  "diff": {
    "routes": { "added": [], "updated": [] },
    "workflows": { "added": [], "updated": [] },
    "policies": { "added": [], "updated": [] }
  }
}
```

`diff` 只在传入 `--diff` 时输出。

## 安全边界

- JSON 不包含目标文件的绝对路径，避免把本机目录结构暴露给下游日志。
- JSON 不包含已存在配置全文，只包含本次草稿和键级 diff 摘要。
- 写入目标仍只允许 `.ai-link/local.yaml` 或 `.ai-link/project.yaml`；公开配置写入仍需要 `--allow-public-config`。

## 后续建议

- Codex skill 可以优先消费该 JSON，而不是解析 YAML 或人类可读摘要。
- 如果后续需要 UI 展示，可直接用 `diff.*.added` / `diff.*.updated` 渲染确认页。
