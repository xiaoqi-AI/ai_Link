# Provider 真实调用验收

状态：手动验收流程。真实 API key 不进入 Git、issue、PR、知识库或聊天记录。

## 目标

`mock`、`openai-compatible`、DeepSeek、Kimi 和 Grok 都已经有 dry-run 路径。真实 provider 验收用于确认本机或 GitHub Actions 中的密钥、endpoint、模型和请求格式能完成一次实际调用。

## 本地 dry-run

dry-run 不访问外部模型，适合公开仓默认验证：

```powershell
npm run providers:dry
```

也可以只验证某一个 provider：

```powershell
npm run ai-link -- providers verify --provider grok
```

## 本地真实调用

推荐先用 Bitwarden Secrets Manager 注入真实 key：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-bitwarden-secrets.ps1
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run providers:live"
```

也可以只验收某一个 provider：

```powershell
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- providers verify --live --provider grok"
```

默认行为：

- `mock` 会本地执行。
- 未配置 key 的 provider 会显示 `skipped`。
- `openai-compatible` 如果仍使用示例 `https://api.example.com/v1`，会显示 `skipped`。
- 加 `--strict` 后，缺 key 或占位 endpoint 会返回失败。

严格验收：

```powershell
npm run providers:live -- --strict
```

单 provider 验收：

```powershell
npm run ai-link -- providers verify --live --provider deepseek
npm run ai-link -- providers verify --live --provider kimi
npm run ai-link -- providers verify --live --provider grok
```

## GitHub 手动 workflow

仓库包含 `Provider Live Verification` workflow，只能手动触发。

GitHub Environment 建议使用 `provider-live`。

GitHub Environment Secret 只保存：

- `BW_ACCESS_TOKEN`

GitHub Environment Variables 保存 Bitwarden secret ID：

- `BWS_OPENAI_COMPATIBLE_API_KEY_SECRET_ID`
- `BWS_DEEPSEEK_API_KEY_SECRET_ID`
- `BWS_MOONSHOT_API_KEY_SECRET_ID`
- `BWS_XAI_API_KEY_SECRET_ID`

真实 API key 仍保留在 Bitwarden Secrets Manager 中。workflow 通过 `bitwarden/sm-action@v2` 临时注入环境变量。

本地可先检查 workflow 是否遵守 BWS 模式：

```powershell
npm run providers:github:check
```

建议先用默认非 strict 模式确认 workflow 可运行；确认 secrets 都配置后，再用 strict 模式验收。

## 记录方式

验收记录只写：

- provider 名称
- 验收日期
- 结果：通过、跳过、失败
- 错误类型摘要

不要记录完整请求、完整响应、API key、账号信息、平台原始内容或任何未脱敏数据。
