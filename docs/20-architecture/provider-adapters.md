# Provider Adapter 说明

## 当前支持状态

| Provider | 类型 | 当前状态 | 默认密钥变量 |
| --- | --- | --- | --- |
| `mock` | 本地 dry-run | 已跑通 | 无 |
| `openai-compatible` | OpenAI-compatible chat completions | 已实现通用适配 | `OPENAI_COMPATIBLE_API_KEY` |
| `deepseek` | OpenAI-compatible | 已实现适配 | `DEEPSEEK_API_KEY` |
| `kimi` | OpenAI-compatible | 已实现适配 | `MOONSHOT_API_KEY` |
| `doubao` | 火山方舟 OpenAI-compatible chat completions | 已实现适配 | `ARK_API_KEY` |
| `grok` | OpenAI-compatible | 已实现适配 | `XAI_API_KEY` |
| `coze` | Agent / workflow | 已实现 dry-run 和本地命令适配 | 由本机命令自行管理 |

真实外部调用需要用户自行配置 API key。没有 key 时，可以用 `--dry-run` 验证路由、模型、endpoint 和请求构造。

真实调用验收流程见 `docs/20-architecture/provider-live-verification.md`。

## Adapter 接口

所有 provider 最终接入统一的运行接口：

```ts
interface ProviderAdapter {
  run(input: ProviderCallInput): Promise<ProviderCallResult>;
}
```

AI Link 的 router 只关心 provider 是否能返回结构化结果，不让 provider 直接执行本地命令。Codex 负责判断、写文件、运行验证和 Git 收尾。

## 默认 endpoint 与模型

以下默认值基于 2026-06-14 查询到的官方文档，用户可以通过 `.ai-link/local.yaml` 或全局配置覆盖。

- DeepSeek 官方文档说明其 API 兼容 OpenAI 格式，OpenAI base URL 为 `https://api.deepseek.com`，示例模型包含 `deepseek-v4-pro`。来源：<https://api-docs.deepseek.com/>
- Kimi 官方文档说明 Kimi Open Platform 提供 OpenAI-compatible HTTP API，SDK base URL 为 `https://api.moonshot.ai/v1`，模型列表包含 `kimi-k2.6`。来源：<https://platform.kimi.ai/docs/api/overview>、<https://platform.kimi.ai/docs/models>
- 火山方舟官方文档的文本生成示例使用 `https://ark.cn-beijing.volces.com/api/v3/chat/completions` 和 `Authorization: Bearer $ARK_API_KEY`；模型列表示例包含 `doubao-seed-1-8-251228`。来源：<https://www.volcengine.com/docs/82379/1399009>、<https://www.volcengine.com/docs/82379/1330310>
- xAI 官方文档提供 OpenAI-compatible base URL `https://api.x.ai/v1`，并有 chat completions endpoint `/v1/chat/completions`。来源：<https://docs.x.ai/overview>、<https://docs.x.ai/developers/rest-api-reference/inference/chat>

## Dry-run 与真实调用

Dry-run 不会访问外部网络：

```powershell
npm run ai-link -- run provider.test --provider grok --dry-run --input "hello"
```

真实调用会向 provider endpoint 发起请求：

```powershell
$env:XAI_API_KEY="..."
npm run ai-link -- run provider.test --provider grok --input "hello"
```

公开示例和测试不会包含真实 key，也不会默认发起外部模型调用。

## Coze Agent 适配

扣子在第一版中作为 `agent_workflow` provider 接入。公开配置只放 provider 名称、模型名和能力标签；真实执行需要用户在 `.ai-link/local.yaml` 或用户全局配置里显式配置本地命令：

```yaml
providers:
  coze:
    type: coze
    model: coze-agent-workflow
    command: coze
    args:
      - session
      - message
      - --wait
      - --format
      - json
```

AI Link 会把任务信息以 stdin JSON 传给该命令，并读取 stdout。命令输出可以是纯文本、单个 JSON，也可以是 Coze CLI 常见的 NDJSON 事件流。若输出 JSON，AI Link 会优先读取 `output`、`content`、`reply_content` 或 `replyContent`：

```json
{ "output": "agent result" }
```

安全边界：

- dry-run 不执行本地命令。
- 没有 `provider.command` 时，真实执行会失败并提示补本机配置。
- dry-run 和运行 metadata 只显示 command 是否已配置及 args 数量，不打印本机命令、参数值或路径。
- 不要把 Coze 登录态、账号信息、私有 workspace ID、token 或本机路径写进公开配置。
- `npm run security:scan` 会阻止 `command` / `args` 落入 `.ai-link/project.yaml` 或 `examples/**/project.yaml`；真实命令只放 `.ai-link/local.yaml` 或用户全局私有配置。
- Agent 输出只作为 Codex 的输入材料；Codex 仍负责文件修改、验证、安全判断和 Git 收尾。
