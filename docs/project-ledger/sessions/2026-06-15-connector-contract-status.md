# 2026-06-15 连接器契约和状态入口

## 本次变化

- 新增公开安全的连接器能力契约层，统一描述 `read_content`、`detect`、`create_draft`、`publish`、`metrics` 等能力。
- 新增 `GET /api/connectors`，用 `connectors:read` 权限读取平台能力状态。
- 控制台首页新增连接器状态表，展示可用、预留或配置异常。
- 微信和朱雀AI mock 连接器标记为可用；抖音、小红书、知乎、头条保持预留。

## 安全边界

- 状态入口只返回平台、能力、方法名和问题代码。
- 不返回 API key、Cookie、浏览器 Profile、二维码、截图、登录态或平台原始内容。
- 真实平台连接器仍应放在私有仓或本机 `runtime/private/` 后续治理范围内。

## 后续建议

- 下一步可先做 Render + Cloudflare Access 远端空跑验收。
- 真实接入时先补私有微信/朱雀AI连接器，再把失败原因映射到 `action_required`。
- 每个平台正式上线前补连接器契约测试、失败场景测试和敏感数据扫描。
