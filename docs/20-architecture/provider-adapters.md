# Provider Adapter 说明

## 当前支持状态

| Provider | 类型 | 当前状态 | 默认密钥变量 |
| --- | --- | --- | --- |
| `mock` | 本地 dry-run | 已跑通 | 无 |
| `openai-compatible` | OpenAI-compatible chat completions | 已实现通用适配 | `OPENAI_COMPATIBLE_API_KEY` |
| `deepseek` | OpenAI-compatible | 已实现适配 | `DEEPSEEK_API_KEY` |
| `kimi` | OpenAI-compatible | 已实现适配 | `MOONSHOT_API_KEY` |
| `grok` | OpenAI-compatible | 已实现适配 | `XAI_API_KEY` |
| `coze` | Agent / workflow | 已预留，MVP runtime 暂未实现 | 待定 |

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

## Coze 预留

扣子在第一版中作为 `agent_workflow` provider 预留。建议后续优先调研官方 API，其次预留 MCP，命令行方式作为兜底。接入前需要确认鉴权、工作流输入输出格式、审计记录和数据出站边界。
