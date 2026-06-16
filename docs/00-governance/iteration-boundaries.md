# 迭代边界与约束

状态：有效治理约定。用于判断后续 AI Link、授权中枢、provider、connector 和发布流程迭代时，哪些可以自动推进，哪些必须等待人工确认。

## 目标

本文件把“能做什么、不能做什么、做到哪里必须停下”等规则写成可复用边界，避免公开仓、私有登录态、真实费用、发布动作和平台账号混在一起。

核心原则：

- 公开仓只承载可公开代码、文档、mock、脱敏报告和治理流程。
- 私有仓、本机 `runtime/private/` 和外部服务账号承载真实登录态、密钥、二维码、截图和未脱敏平台内容。
- 先做本地 dry-run、mock 和只读验证，再进入真实 provider、真实平台和发布动作。
- 任何会产生真实外部影响、费用、账号风险或公开承诺的动作，都必须有人确认。

## 迭代分级

### L0：可自动推进

Codex 可以直接推进并提交的范围：

- 文档补充、公开说明、项目账本和脱敏架构记录。
- mock connector、dry-run provider、测试夹具和本地只读检查。
- 安全扫描、包内容检查、release readiness、fresh clone 和治理脚本。
- 控制台展示脱敏摘要、状态、审计 metadata 和公开安全报告。
- 新增不会触发外部调用、不会读取密钥、不会发布内容的本地工具。

约束：

- 必须保持公开仓不含 `.env`、token、Cookie、二维码、浏览器 profile、截图、真实平台原文和私有路径。
- 影响用户入口、使用方式或安全边界时，要同步更新 `README.md`、`docs/user-guide.md` 或 `docs/00-governance/`。
- 重要迭代结束前要运行对应验证，并同步 GitHub 与知识库镜像。

### L1：需要人工确认后推进

Codex 可以准备方案、脚本、检查清单和预览，但执行前需要人工确认：

- Git tag、GitHub Release、npm publish 或任何公开发布动作。
- GitHub branch protection、required checks、secret scanning、push protection 等 UI 设置。
- Render、Cloudflare Access、SMTP、域名、数据库等生产环境配置。
- Bitwarden Secrets Manager 项目、machine account、`BWS_ACCESS_TOKEN`、GitHub Environment Secret。
- 真实 provider 调用、provider-live workflow dispatch、模型费用边界和外部 API 配额使用。
- `release:decisions:update -- --yes` 这类会把人工决策写入公开记录的动作。

约束：

- 人工确认应留下公开安全证据，例如“已在 GitHub UI 开启 branch protection”，不要写入 token、账号细节或截图。
- 预览命令和检查报告可以进公开仓；真实凭据、一次性 token 和平台后台截图不进公开仓。

### L2：必须由人工协助

这些动作无法由 Codex 单独完成，必须由你或授权维护者参与：

- 微信、朱雀AI、抖音、小红书、知乎、头条等账号登录、扫码、验证码、短信、二次验证和续登。
- 选择 Cloudflare Access 授权邮箱范围、审批收件邮箱、生产域名和外部服务套餐。
- 确认真实内容是否可发布、是否需要修改、是否符合账号定位和平台规则。
- 确认真实 provider 调用预算、模型选择、费用上限和是否允许 live 验收。
- 确认 npm 发布渠道、GitHub Release 公开时机和回滚策略。

约束：

- Codex 可以提示“需要续登”“需要验证码”“需要审批”，但不能绕过平台认证或替你确认高风险动作。
- 正式发布内容必须每次人工确认；系统只能生成草稿、摘要和审批入口。

### L3：只进私有边界

以下内容只能进入私有仓、本机私有目录或外部 secret manager：

- 平台 Cookie、localStorage、session、浏览器 profile、二维码、登录截图。
- 未脱敏平台原文、私密网页 HTML、账号后台数据、联系人或用户信息。
- 真实 API key、BWS token、Cloudflare service token、SMTP 密码、数据库连接串。
- 内部供应商评估、未公开运营策略、真实账号配置和私有 connector 实现细节。

约束：

- 公开仓只保留合同、mock、脱敏接口、错误分类和公开安全说明。
- 知识库镜像只同步公开说明、架构决策和脱敏交接；不接收运行态和登录态。

### L4：暂不承诺

在没有单独确认前，以下能力不作为当前 MVP 承诺：

- 真实平台自动发布。
- 云端保存高价值账号浏览器登录态。
- 自动绕过验证码、风控、人机验证或平台频控。
- 对平台条款不明确的抓取、批量搬运、批量私信或自动互动。
- 未经成本审批的真实模型批量调用。
- 未经发布决策的 npm 包发布或正式公开版本承诺。

## 推进顺序约束

后续迭代默认按下面顺序推进：

1. 先文档和契约，再实现。
2. 先本地 mock / dry-run，再真实外部调用。
3. 先只读和草稿，再发布能力。
4. 先脱敏审计，再保存或同步结果。
5. 先安全扫描和 fresh clone，再 tag / release / deploy。
6. 先人工门槛关闭，再进入生产或真实账号。

任何阶段如果发现敏感内容、登录失效、验证码、平台限流、费用超界、Git 冲突或发布决策未确认，应停止自动推进并明确列出需要人工处理的事项。

## 授权中枢专项约束

- Render 端只保存任务、审批、审计和脱敏 artifact。
- 本地执行器可以使用本机浏览器 profile，但 profile 必须放在 `runtime/private/`，不上传 Render、不进 Git、不进知识库。
- `GET /api/connectors` 只展示平台、状态、能力和问题代码，不展示私有实现或登录态。
- `POST /api/tasks/:id/approve` 只能用于确认继续或确认发布；正式发布仍必须每次人工确认。
- 邮件只发提醒和控制台链接，不放正文、截图、token 或平台内容。
- 真实 connector 上线前必须补契约测试、失败分类、脱敏检查和人工处理路径。

## Provider 和费用约束

- dry-run 默认安全，可自动执行。
- 真实 provider 调用必须满足 policy gate，并需要显式审批或通过已确认的发布/验收流程。
- provider-live 报告只保存安全摘要，不保存原始 prompt、原始 output 或密钥。
- 成本上限、模型范围和 live 验收时间窗口必须由人工确认。

## 发布约束

- `release:plan`、`release:readiness`、`release:evidence` 和 `package:check` 都是检查，不是发布。
- 创建 `v0.1.0` tag、GitHub Release 或 npm publish 前，必须关闭 manual gates 或明确记录 waiver。
- npm 发布必须先做 `npm publish --dry-run --access public`，并确认账号、包名、版本、包内容和回滚策略。
- 发布后如果发现敏感内容或错误包面，优先撤回/弃用发布并更新安全说明，不做静默覆盖。

## 完成定义

一次有效迭代完成时，应至少说明：

- 改了什么。
- 做过哪些验证。
- GitHub 是否已同步。
- 知识库镜像是否已同步。
- 哪些事项仍需要人工确认。
- 是否触碰了真实账号、真实费用、发布动作或私有数据。

如果触碰了 L1/L2/L3 边界，还应补充证据位置和风险说明；如果只做 L0，本地检查和公开文档记录即可。
