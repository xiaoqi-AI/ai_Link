# 2026-06-14 统一授权中枢 MVP

## 目标

按确认方案实现第一版“云端私有控制台 + 本地浏览器执行器”的授权中枢公开骨架，降低跨平台内容运营任务中的重复人工登录成本，同时保持公开仓脱敏。

## 已实现

- 新增 Express 控制台和 API：健康检查、任务、审批、执行器领取/回传、审计。
- 新增应用内登录；生产环境要求强密码和 session secret。
- 新增 API token 哈希存储和 scope 校验：管理、执行器、Codex 三类默认权限。
- 新增 Postgres 存储层；无 `DATABASE_URL` 时用内存存储便于本地测试。
- 新增本地执行器脚本和 mock 微信/朱雀AI连接器。
- 新增 Render 部署骨架、`.env.example`、安全扫描脚本和授权中枢测试。
- 更新 README、用户指引和架构文档。

## 验证

- `npm test`
- `npm run security:scan`
- `npm audit --audit-level=high`

## 风险边界

- 公开 MVP 只启用 mock 平台连接器；真实微信、朱雀AI、抖音、小红书、知乎、头条连接器仍需私有实现。
- Render 暂不保存浏览器登录态；高价值账号 Profile 只应放在本机 `runtime/private/`。
- 正式发布动作必须人工确认。
