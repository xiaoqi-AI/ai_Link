# 2026-06-15 公开配置安全门禁

## 本次变化

- 扩展 `tools/security-scan.js`，对 `.ai-link/project.yaml` 和 `examples/**/project.yaml` 增加结构化 YAML 检查。
- 公开配置中禁止出现真实密钥字段、本机命令字段、认证头、Cookie、`.env`、`runtime/private/` 或本机用户路径。
- 新增 `tests/security-scan.test.js`，验证 `apiKeyEnv` 这类环境变量名可以保留，`command` / `args` 会被拦截。
- 整理连接器契约状态入口，控制台和 `GET /api/connectors` 只展示脱敏后的平台能力状态。

## 安全边界

- 真实 API key、token、Coze 命令、登录态、workspace、Cookie 和本机路径仍只能放在 Bitwarden Secrets Manager、`.ai-link/local.yaml`、用户全局私有配置或本机私有目录中。
- 公开仓、知识库、issue、PR 和聊天记录只允许出现环境变量名或脱敏状态。
- 外部模型和真实平台调用默认先用 dry-run 或只读状态检查；涉及费用或账号动作时继续保留人工确认。

## 后续规划

- 第一优先级：完成用户侧 Bitwarden Secrets Manager 项目、machine account、GitHub Environment Secret 和 secret ID variables 的实际配置。
- 第二优先级：做 Render + Cloudflare Access 空跑部署验收，确保公网入口具备双门禁和只读健康检查。
- 第三优先级：逐步接入真实平台连接器，从微信和朱雀AI开始，把登录失效、验证码、频率限制映射为 `action_required`。
- 第四优先级：把 provider live、workflow dry-run、公开配置安全扫描、知识库镜像校验纳入固定发布前清单。

## 验证

- `npm run security:scan`
- `npm run check`
- `npm run auth-hub:test`
