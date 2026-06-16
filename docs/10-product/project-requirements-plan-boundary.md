# AI Link 项目需求、规划与边界

状态：当前项目合同。用于后续目标模式、Codex 协作、其他模型/Agent 协作和维护者交接。本文按 `docs/00-governance/iteration-boundaries.md` 的四段式边界卡编写：需求、预期开发工作、验证、边界控制。

日期：2026-06-16

## 1. 需求

### 用户目标

AI Link 要让 Codex 能按任务链接合适的模型、Agent 和工作流。第一版优先服务 Codex 本地工作流，同时抽象成公开 GitHub 用户可以复用的能力。

典型目标场景：

- 用户在 Codex 会话里自然语言说明任务，例如“用 Grok 调研，用 Kimi 写文章，后续实现继续由 Codex 完成”。
- 新 skill 可以通过自然语言生成 route / workflow / policy 草案，而不是让用户手写复杂配置。
- 不同 provider、agent 和 workflow 能在统一策略边界下运行：mock/dry-run 默认安全，真实外部调用需要审批。
- 公开仓提供可复用的 router、providers、skills、policies 约定；真实密钥、账号登录态和内部运营策略留在私有边界。

### 成功标准

当前阶段成功标准不是“所有模型和平台都真实打通”，而是：

- 本地用户能从 fresh clone 完成无密钥 dry-run 入场。
- Codex / skill 能用 AI Link 生成或运行多阶段 workflow 草案。
- 公开仓能清楚说明哪些能力已可用、哪些需要人工确认、哪些只在私有边界。
- 每次继续开发前能用 `npm run iteration:boundary` 明确本轮需求、预期工作、验证和停止条件。
- 真实 provider、Bitwarden、GitHub UI、发布和 connector 能力都有明确人工门禁。

### 输入材料

本项目当前依据：

- 用户确认的产品名：AI Link；CLI 名：`ai-link`；核心模块：`router`、`providers`、`skills`、`policies`。
- 配置优先级：会话临时指定 > 项目 local 私有配置 > 项目公开配置 > 用户全局配置 > 默认配置。
- 首批 provider：mock/local-dry-run、openai-compatible、DeepSeek、Kimi、豆包、Grok；Coze 作为 agent provider dry-run / local command 入口。
- 公开许可证：Apache-2.0。
- 公开仓：`xiaoqi-AI/ai_Link`；内部 companion 仓：`xiaoqi-AI/ai_Link-internal`。
- 迭代边界：先明确需求、预期开发工作、验证和边界控制，发现偏差先暂停确认。

### 输出形态

项目应交付四类公开产物：

- 本地 CLI 能力：配置校验、provider dry-run、workflow run、skill draft、run record、报告脚本。
- 公开文档：quickstart、user guide、provider/skill/policy 架构、项目规划、迭代边界、发布门禁。
- 治理和验证工具：security scan、fresh clone、package check、release readiness、external preflight、iteration boundary。
- 示例：auto-ops、Codex skill 示例、BWS secret mode 示例、Auth Hub mock 连接器骨架。

不把真实凭据、登录态、账号后台内容、二维码、截图、原始 provider 响应或私有 connector 实现放入公开产物。

### 非目标

当前阶段默认不做：

- SDK。
- 真实平台自动发布。
- 真实微信、朱雀AI、抖音、小红书、知乎、头条 connector 的公开实现。
- 自动绕过验证码、扫码、人机验证、平台风控或频控。
- npm publish、GitHub Release、`v0.1.0` tag，除非 release owner 明确批准。
- 未经成本审批的 provider-live 真实模型调用。
- 大型中台化、完整网页管理台、商业化多用户 SaaS。

## 2. 规划

### 当前已完成基线

当前公开仓已经具备：

- TypeScript / Node.js CLI 骨架和 `ai-link` 命令入口。
- 配置分层、provider adapter、route、workflow、policy 和 run record。
- `mock`、openai-compatible、DeepSeek、Kimi、豆包、Grok、Coze agent dry-run / local command 适配。
- 自然语言 `skill draft`，可生成 route / workflow / policy 草案并预览 diff。
- `auto_ops` 示例 workflow：Grok 调研、Kimi 写稿、Coze agent workflow dry-run。
- 出站审批、provider type gate、model pattern gate、预算估算和审计 metadata。
- BWS/Bitwarden Secrets Manager 规划、worksheet、acceptance、GitHub provider-live secret-id workflow。
- Auth Hub 公开骨架：任务 API、控制台、审批、审计、本地执行器、mock 连接器和连接器合同状态。
- 发布与治理基线：CI、security scan、package check、install smoke、release decisions、release readiness、external preflight、iteration boundary。

### 阶段规划

#### v0.1：本地公开 MVP

目标：让公开用户和 Codex 能在无真实密钥的情况下完成本地 dry-run、skill draft、workflow dry-run 和治理检查。

预期工作：

- 保持 quickstart、onboarding、provider dry-run、workflow dry-run 可用。
- 保持 `iteration:boundary`、`next:actions`、`external:preflight`、`release:readiness` 可用。
- 关闭或记录 v0.1 发布前人工门禁。
- 明确 v0.1 是否 repository-local、GitHub Release 或 npm public。

边界：不声称真实 provider-live 已完成，不发布 npm，不创建 tag，除非人工决策关闭。

#### v0.2：真实 provider 和 skill authoring

目标：在 Bitwarden 和成本审批完成后，做最小真实 provider 验收，同时让新 skill 创作更顺。

预期工作：

- 创建 Bitwarden local-dev / CI 项目和 machine account。
- 通过 `bws run` 临时注入 provider key。
- 生成脱敏 provider-live 报告。
- 优化自然语言 skill draft 到 route/workflow/policy 的转换体验。

边界：真实 API key、BWS token、GitHub Environment Secret 和 raw provider response 不进入公开仓或知识库。

#### v0.3：Agent 和 connector 扩展

目标：把模型路由扩展到更安全的 agent / connector workflow，但仍先走 mock、contract 和私有边界。

预期工作：

- 保持 Coze 为 agent provider dry-run / local command；真实 API/MCP/CLI 路径另行确认。
- Auth Hub 继续承载任务、审批、审计和脱敏 artifact。
- 真实 connector 只在私有仓或本机私有目录实现，公开仓保留合同、状态和失败分类。

边界：不公开真实平台账号实现，不保存登录态到云端，不自动正式发布。

#### 后续：SDK 和生态

目标：等 CLI、配置 schema、provider/connector 合同和治理门禁稳定后，再评估 SDK。

预期工作：

- 根据真实使用反馈提炼稳定 API。
- 评估 SDK 是配置文件驱动、程序化 builder，还是二者兼有。
- 继续保持密钥管理只在用户私有 secret manager 或环境中。

边界：第一版不急着做 SDK，不为了未来生态提前扩大项目体积。

## 3. 下一步计划

### 当前优先级

1. 保持本地基线绿色。
   - 运行 `npm run iteration:boundary`、`npm run check`、`npm test`、`npm run security:scan`。
   - 价值：确保后续外部设置从干净可信的公开仓开始。

2. GitHub UI 加固。
   - 运行 `npm run github:hardening:next` 查看 UI 链接、验证命令和 release decision 更新预览。
   - 人工完成 main branch protection / ruleset、required `Verify`、secret scanning、push protection。
   - 价值：让公开仓具备发布前最小安全防线。

3. Bitwarden 基础配置。
   - 运行 `npm run bws:next` 和 `npm run bws:worksheet`。
   - 人工创建 Bitwarden project、machine account 和 secret values。
   - 价值：让真实 provider key 有安全托管路径。

4. v0.1 release decision closeout。
   - 运行 `npm run release:decisions:next`。
   - 人工决定 repository-local、GitHub Release 或 npm public。
   - 价值：避免不清楚发布口径时提前 tag 或 publish。

5. 最小 provider-live 验收。
   - 前置：GitHub secret scanning、BWS、provider-live Environment 和成本审批完成。
   - 运行 `npm run providers:github:dispatch-plan`，确认后再运行 strict dispatch。
   - 价值：用最小真实调用证明 provider wiring，不暴露 raw response 或 key。

### 本轮之后建议

下一轮只选择一个主目标：

- 选项 A：GitHub UI 加固与 release decision evidence。
- 选项 B：Bitwarden BWS 项目和本地 session 验收。
- 选项 C：skill authoring 模板优化。
- 选项 D：Auth Hub 远端 mock 空跑边界设计。

不建议下一轮同时做 GitHub UI、BWS、provider-live、真实 connector 和 npm 发布。

## 4. 验证

### 本地基线

每次影响公开行为或用户入口时，至少运行：

```powershell
npm run iteration:boundary
npm run check
npm test
npm run security:scan
```

### 发布/外部前置

触碰 GitHub UI、Bitwarden、provider-live、release decisions 或发布前，至少运行：

```powershell
npm run external:preflight:json
npm run release:readiness:json
npm run next:actions:json
```

### 包和 fresh clone

影响安装、CLI 入口、README、docs 或 package surface 时，运行：

```powershell
npm run package:check
npm run package:install-smoke
npm run verify:fresh
```

### 验收证据边界

可记录：

- 命令名、状态、通过/失败摘要。
- Git commit、GitHub setting 名称、公开文档路径。
- 脱敏 report 路径和 artifact 名称。

不可记录：

- API key、token、BWS secret value、GitHub secret value。
- 登录态、二维码、Cookie、浏览器 profile、平台后台截图。
- raw provider response、真实平台原文、私有 connector payload。

## 5. 项目边界

### 公开仓边界

公开仓只放：

- 可公开代码、CLI、mock、dry-run、合同、测试和治理脚本。
- 用户文档、架构说明、开放问题、发布门禁和脱敏账本。
- 不含真实密钥或账号状态的示例。

公开仓不放：

- `.env`、token、API key、证书、二维码、登录状态。
- 私密截图、未脱敏平台原文、个人或账号后台信息。
- `runtime/private/`、浏览器 profile、Cookie、真实 connector 私有实现。

### 私有边界

私有仓、本机 `runtime/private/`、Bitwarden 或外部 secret manager 用于：

- 真实 provider key。
- BWS machine account token。
- GitHub Environment Secret。
- 平台账号登录态、二维码、验证码处理、浏览器 profile。
- 内部运营策略、供应商评估、未公开 connector 实现。

### 人工确认边界

必须人工确认：

- GitHub UI branch protection / ruleset、secret scanning、push protection。
- Bitwarden project、machine account、BWS token、provider key。
- provider-live dispatch 和模型费用上限。
- `v0.1.0` tag、GitHub Release、npm publish。
- 真实平台登录、内容发布、验证码、人机验证、平台风控处理。
- 产品方向升级，例如 SDK、完整网页管理台、真实多平台 connector。

### 停止条件

出现以下情况应暂停并重新确认：

- 用户目标、成功标准或非目标不清。
- 小需求开始跨三个以上子系统。
- 目标模型建议引入大而全抽象、长期框架或新平台能力。
- 连续两轮验证失败，且原因不是局部 bug。
- 需要真实账号、真实费用、发布承诺或敏感数据。
- token、时间或工具调用不再匹配本轮价值。

## 6. 当前人工协助事项

- GitHub maintainer：配置 branch protection / ruleset、required `Verify`、secret scanning、push protection。
- Secret owner：创建 Bitwarden project、machine account、secret values，并安全设置 BWS session。
- Release owner：决定 v0.1 release channel。
- Cost approver：决定首个 provider-live provider、prompt、预算上限和验收窗口。
- Connector owner：确认 Coze 真实接入路径和后续真实平台 connector 优先级。

## 7. 价值判断

AI Link 当前最重要的价值不是“多接几个模型”，而是把模型、Agent、workflow、密钥、审批和审计纳入可治理的本地优先开发模式。

短期价值：

- Codex 能把不同任务路由给更合适的模型或 Agent。
- 用户可以自然语言生成 skill/workflow 草案。
- 公开仓用户可以无密钥试用。
- 真实 provider 和账号动作有安全门禁。

中期价值：

- 自动运营项目能拆成调研、写作、检测、草稿、审批、审计的稳定链路。
- 多模型协作不再靠一次性 prompt，而是靠可验证配置和 run record。
- 私有 connector 能逐步接入真实平台，同时公开仓保持安全干净。

长期价值：

- 在 CLI 合同稳定后，AI Link 可以成为 Codex 与外部模型/Agent/工作流之间的通用连接层。
- SDK、网页管理台、多平台 connector 和生态扩展可以在真实使用证据充分后再推进。
