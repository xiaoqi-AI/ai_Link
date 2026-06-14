# Connector Contracts

AI Link 的连接器合同用于描述平台侧能力边界。它和 provider 不同：

- provider 负责调用模型或 Agent，例如 Grok、Kimi、DeepSeek、Coze。
- connector 负责连接内容平台或检测平台，例如微信公众号、朱雀AI、抖音、小红书、知乎、头条。
- Codex 仍负责最终的工程动作、验证、安全判断和 Git 收尾。

## Public MVP Status

公开仓当前只启用安全 mock 连接器：

| Platform | Status | Capabilities |
| --- | --- | --- |
| `wechat_official` | available | `read_content`, `create_draft`, `publish`, `metrics` |
| `zhuque_ai` | available | `detect` |
| `douyin` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |
| `xiaohongshu` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |
| `zhihu` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |
| `toutiao` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |

`reserved` 表示公开仓只保留合同位置，不包含真实登录态、账号、Cookie、浏览器 profile 或平台私有实现。

## Read-only Status API

授权中枢提供只读状态接口：

```text
GET /api/connectors
Authorization: Bearer <token with connectors:read>
```

返回内容只包含平台、状态、能力、方法名和合同问题，不返回密钥、Cookie、二维码、截图、登录态、原始平台内容或本机路径。

默认开发配置中：

- `admin` token 拥有 `connectors:read`。
- `codex` token 默认拥有 `connectors:read`。
- `executor` token 不拥有该权限。

## Contract Rules

每个真实 connector 上线前至少需要满足：

- 实现对应平台的全部必备方法。
- 失败时把登录过期、验证码、限流、人工验证等情况映射为 `needs_action` / `action_required`。
- 不把原始 HTML、Cookie、token、账号详情或截图写入 API 响应、Git、日志或知识库。
- 补充合同测试、失败场景测试和敏感信息扫描。

真实平台 connector 应放在私有仓、本机私有配置或 `runtime/private/` 治理边界内；公开仓只保留合同、mock、状态页和安全测试。
