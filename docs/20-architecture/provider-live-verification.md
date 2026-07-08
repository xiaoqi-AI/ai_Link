# Provider 真实调用验收

状态：手动验收流程。真实 API key 不进入 Git、issue、PR、知识库或聊天记录。

## 目标

`mock`、`openai-compatible`、DeepSeek、Kimi、豆包和 Grok 都已经有 dry-run 路径。真实 provider 验收用于确认本机或 GitHub Actions 中的密钥、endpoint、模型和请求格式能完成一次实际调用。

## 本地 dry-run

dry-run 不访问外部模型，适合公开仓默认验证：

```powershell
npm run providers:dry
npm run providers:dry:json
```

也可以只验证某一个 provider：

```powershell
npm run ai-link -- providers verify --provider grok
npm run ai-link -- providers verify --provider grok --json
```

`--json` 会输出稳定的机器可读报告：

- `summary.ok`：是否没有失败项。
- `summary.mode`：`dry-run` 或 `live`。
- `summary.strict`：是否启用严格模式。
- `summary.counts`：`ok`、`skipped`、`failed` 和 `total` 计数。
- `providers`：逐个 provider 的 `name`、`type`、`mode`、`status` 和简短 `detail`。

## 本地真实调用

推荐先用 Bitwarden Secrets Manager 注入真实 key：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-bitwarden-secrets.ps1
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run providers:live"
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run providers:live:safe-report"
npm run bws:run -- -CommandLine "npm run providers:live:safe-report"
```

`providers verify --live` 是专门的 provider 验收入口，执行该命令即表示已确认本次 live 验收可能产生外部模型调用或费用。普通 `ai-link run` 真实调用仍需按 route policy 显式加 `--approve-policy`；`workflow run` 则使用 `--approve-stage <stage>` 或 `--approve-all`。

也可以只验收某一个 provider：

```powershell
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- providers verify --live --provider grok"
npm run bws:run -- -CommandLine "npm run ai-link -- providers verify --live --provider grok"
```

默认行为：

- `mock` 会本地执行。
- 未配置 key 的 provider 会显示 `skipped`。
- `openai-compatible` 如果仍使用示例 `https://api.example.com/v1`，会显示 `skipped`。
- 加 `--strict` 后，缺 key 或占位 endpoint 会返回失败。

严格验收：

```powershell
npm run providers:live -- --strict
npm run providers:live -- --strict --json
npm run providers:live:safe-report:strict
```

单 provider 验收：

```powershell
npm run ai-link -- providers verify --live --provider deepseek
npm run ai-link -- providers verify --live --provider kimi
npm run ai-link -- providers verify --live --provider doubao
npm run ai-link -- providers verify --live --provider grok
```

## 扣子本地 API 验证

`coze` provider 当前是 agent / workflow 适配器。公开项目配置只声明 `coze` provider；真实扣子调用必须通过本机私有配置或用户全局配置接入，不能把 token、Bot ID、workspace ID、登录态、原始响应或截图写进公开仓库。

扣子 API 验证推荐先走本地最小验证，不直接接入 GitHub Actions：

- 使用普通可发布智能体，不使用职业模板 / 会话模板 agent 作为首轮 API 验证对象。
- 智能体必须发布到 `API` / `Agent As API` / `API 服务` 渠道；仅创建智能体或仅能在网页会话中使用，不代表 OpenAPI 可调用。
- Bot ID 应来自智能体开发页 URL 中 `/bot/<数字>` 后面的数字；`/session/<数字>` 通常是会话 ID，不应作为 Bot ID。
- 本地适配脚本放在 `runtime/private/`，本地 provider 覆盖放在 `.ai-link/local.yaml`；这两个路径默认不进入 Git。
- Token 只放在当前 shell session 的环境变量里，不写入 `.env`、文档、Issue、PR、知识库或聊天记录。

推荐的最小扣子智能体提示词：

```text
你是 AI Link provider-live 验证智能体。收到任何消息后只回复 OK。
```

本地会话变量示例：

```powershell
$env:COZE_BOT_ID = "<智能体开发页 /bot/ 后面的数字>"
$secure = Read-Host "请输入 Coze API Token" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:COZE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
$env:COZE_USER_ID = "ai-link-local-provider-live"
```

先跑私有诊断命令，确认扣子 API 本身可用：

```powershell
@'
{"input":"AI Link provider-live verification. Reply with OK only."}
'@ | node runtime/private/coze-live-adapter.mjs
```

诊断通过后，再生成 AI Link 脱敏报告：

```powershell
npm.cmd run ai-link -- providers verify --live --provider coze --json --safe --output runtime/tmp/provider-live-report.json --force
```

常见失败判断：

- `has not been published to the channel Agent As API`：智能体没有发布到 API 渠道，或使用了职业模板 / session 类 agent。
- `401` / `403`：token 无效、过期或权限不足。
- `bot id` 相关错误：确认使用的是 `/bot/<数字>`，不是 `/session/<数字>`。
- 没有 assistant answer：检查智能体是否能正常回复、是否发布了最新版本。

本地扣子验证通过后，只能证明“本机最小扣子 API live check 通过”。除非后续配置 GitHub Environment / Bitwarden 并跑通 `Provider Live Verification` workflow，否则不要公开声明 CI 级 live provider verification。

### Coze Code 部署态 `stream_run`

Hermes 侧已经验证出另一类 Coze 调用方式：Coze Code 部署站点 API。AI Link 复用这套部署态 `stream_run` 联调经验，但不接管 Hermes 主流程，也不新增内容平台 connector。

适用判断：

- 如果对象是普通 Bot / Agent，并且已发布到 `Agent As API`，可以继续按 Bot Chat API 思路验证。
- 如果对象来自 Coze Code 部署站点，入口形如 `https://xxxx.coze.site/stream_run`，应走部署态 `stream_run`。
- AI Link 只把它作为 `coze` provider 的本机 command adapter；编排、质量门禁和发布流程仍由调用方负责。

私有环境变量：

```powershell
$env:COZE_STREAM_RUN_ENDPOINT = "https://xxxx.coze.site/stream_run"
$env:COZE_PROJECT_ID = "<Coze Code project id>"
$env:COZE_SESSION_ID = "<Coze Code session id>"
$secure = Read-Host "请输入 Coze API Token" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:COZE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
```

当前本机私有 adapter 使用 Hermes 已验证的高层形态：

- `POST <COZE_STREAM_RUN_ENDPOINT>`
- `Authorization: Bearer <COZE_API_TOKEN>`
- `Content-Type: application/json`
- 请求体包含 `project_id`、`session_id` 和 `content.query.prompt[0].content.text`
- `content.query.prompt[0].content.text` 内放 AI Link 的 JSON 请求信封
- 响应按 `text/event-stream` 解析，优先提取 `content.answer`
- 只在 `COZE_SAVE_RAW=1` 时把原始响应写入 `runtime/private/`，默认不保存原始响应

## GitHub 手动 workflow

仓库包含 `Provider Live Verification` workflow，只能手动触发。

GitHub Environment 建议使用 `provider-live`。

GitHub Environment Secret 只保存：

- `BW_ACCESS_TOKEN`

GitHub Environment Variables 保存 Bitwarden secret ID：

- `BWS_OPENAI_COMPATIBLE_API_KEY_SECRET_ID`
- `BWS_DEEPSEEK_API_KEY_SECRET_ID`
- `BWS_MOONSHOT_API_KEY_SECRET_ID`
- `BWS_ARK_API_KEY_SECRET_ID`
- `BWS_XAI_API_KEY_SECRET_ID`

真实 API key 仍保留在 Bitwarden Secrets Manager 中。workflow 通过 `bitwarden/sm-action@v2` 临时注入环境变量。

配置 GitHub Environment Variables 时，可以先生成清单，也可以在当前会话具备 BWS 和 GitHub token 后自动写入变量：

```powershell
npm run bws:github-vars
npm run bws:github-vars:apply-plan
npm run bws:github-vars:apply
```

`bws:github-vars:apply` 只写 `BWS_*_SECRET_ID` 这类 GitHub Environment Variables，不创建、不更新、也不打印 `BW_ACCESS_TOKEN`。`BW_ACCESS_TOKEN` 必须作为 GitHub Environment Secret 单独安全设置。

本地可先检查 workflow 是否遵守 BWS 模式：

```powershell
npm run providers:github:check
npm run bws:check
```

配置完 GitHub Environment 后，可以在本机提供 `GH_TOKEN` 或 `GITHUB_TOKEN`，只检查远端 environment、variable 和 secret 名称是否齐全：
```powershell
npm run providers:github:remote-check
powershell -ExecutionPolicy Bypass -File tools/check-bws-mode.ps1 -CheckRemote
```

远端检查不会读取或输出 secret value；GitHub environment secrets API 只返回 secret 名称，environment variables API 会返回变量值，但脚本只比对变量名、不打印变量值。

建议先用默认非 strict 模式确认 workflow 可运行；确认 secrets 都配置后，再用 strict 模式验收。

触发 workflow 前先查看计划，不会产生真实调用：

```powershell
npm run providers:github:dispatch-plan
```

确认远端配置、BWS 严格验收和模型费用边界后，再显式触发：

```powershell
npm run providers:github:dispatch
npm run providers:github:dispatch-strict
```

这两个触发命令都需要当前会话中的 `GH_TOKEN` 或 `GITHUB_TOKEN`，并且脚本内置了费用确认参数；它只触发 GitHub workflow，不读取或打印任何 provider API key。

workflow 会把脱敏验收摘要上传为 GitHub Actions artifact：

- Artifact 名称：`provider-live-summary`
- 文件路径：`runtime/tmp/provider-live-report.json`
- 保留时间：14 天

该报告由 `providers:live:safe-report` 或 `providers:live:safe-report:strict` 生成，只保留 `summary`、provider 名称、类型、模式、状态和安全化后的 `detail`。成功项不会包含模型输出；未知失败项只会提示查看私有日志。

## 记录方式

验收记录只写：

- provider 名称
- 验收日期
- 结果：通过、跳过、失败
- 错误类型摘要

不要记录完整请求、完整响应、API key、账号信息、平台原始内容或任何未脱敏数据。

如果使用 `--json` 保存验收证据，只保留 `summary`、provider 名称和状态；live 模式下的 provider `detail` 可能包含模型返回的第一行摘要，不要直接复制到公开 issue、PR 或知识库。

如果需要生成可以公开引用的证据，使用：

```powershell
npm run providers:live:safe-report
npm run providers:live:safe-report:strict
```

它们会写入 `runtime/tmp/provider-live-report.json`，默认不进入 Git。公开沟通时优先引用 `summary` 和 provider 状态，不引用完整运行日志。
