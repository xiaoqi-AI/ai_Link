# AI Link 细化项目规划

状态：工作规划。用于后续迭代前对齐需求、预期开发工作、验证方式和边界控制，不等同于公开承诺。

日期：2026-06-16

## 规划原则

AI Link 的后续推进遵循 `docs/00-governance/iteration-boundaries.md`：

- 先明确需求、非目标、验收和预算，再进入开发。
- 每次迭代只追一个可交付目标。
- 先本地 dry-run、mock、只读和脱敏审计，再进入真实 provider、真实平台和生产环境。
- 发现预期不符、范围膨胀、token 消耗异常或目标不清时，先暂停并重新确认。
- 发布、真实费用、真实账号、生产配置和正式内容发布必须人工确认。

## 当前基线

当前公开仓已经具备：

- `ai-link` CLI、provider adapter、route、workflow、policy、run record 和 Codex skill 示例。
- mock、OpenAI-compatible、DeepSeek、Kimi、豆包、Grok、Coze provider 路径。
- Bitwarden Secrets Manager / BWS 的本地和 GitHub provider-live 配置工作流。
- 统一授权中枢公开骨架：控制台、任务 API、审批、审计、本地执行器、mock 微信/朱雀AI、连接器合同状态。
- 发布和治理检查：onboarding、package check、install smoke、GitHub safety、release plan、release readiness、security scan、fresh clone。
- 公开/私有边界：公开仓保存可公开能力；真实密钥、登录态、未脱敏内容和私有 connector 实现留在私有边界。

当前仍不应假设：

- 已支持真实微信、朱雀AI、抖音、小红书、知乎、头条账号自动化。
- 已允许真实平台自动发布。
- 已完成 GitHub UI 安全设置、v0.1 tag、GitHub Release 或 npm 发布。
- 已批准真实 provider live 调用费用。

## 阶段 1：v0.1 公开发布门槛

### 需求

- 明确 v0.1 是否只保持仓库本地使用，还是创建 GitHub Release / npm 包。
- 关闭或记录所有发布前人工门槛。
- 确保公开用户可以从 fresh clone 完成无密钥 dry-run 入场。

### 预期开发工作

- 维护 `CHANGELOG.md`、`docs/releases/v0.1.0.md` 和 release decision 记录。
- 保持 `release:plan`、`release:readiness`、`package:check`、`package:install-smoke` 可用。
- 根据人工确认，更新 release decision 公开安全证据。
- 如决定发布，准备 tag、GitHub Release body 和 npm dry-run。

### 验证

- `npm run release:plan`
- `npm run release:readiness`
- `npm run package:check`
- `npm run package:install-smoke`
- `npm run security:scan`
- `npm run verify:fresh`

### 边界控制

- `release:*` 和 `package:*` 默认只是检查，不创建 tag、不发布 GitHub Release、不发布 npm。
- `v0.1.0` tag、GitHub Release、npm publish 必须人工确认。
- npm 发布前必须先跑 `npm publish --dry-run --access public`。
- 如果发布门槛仍 open，只能继续维护草稿和检查，不能声称正式发布完成。

## 阶段 2：远端授权中枢空跑

### 需求

- 让 `voice.xiao-qi-ai.com` 承载私有控制台，但第一阶段只跑 mock 或脱敏任务。
- 验证 Render、Postgres、Cloudflare Access、应用内登录和本地执行器远端连接。

### 预期开发工作

- 整理 Render 环境变量和 Cloudflare Access 配置清单。
- 配置执行器通过远端 URL 和 token 领取任务。
- 补齐远端 smoke 脚本所需的安全提示和失败诊断。
- 保持控制台只展示脱敏结果、审批状态、连接器状态和审计摘要。

### 验证

- `npm run auth-hub:deploy:check`
- `npm run auth-hub:remote:smoke`
- Cloudflare Access 未授权访问拦截检查。
- 授权访问后仍需应用内登录检查。
- 本地执行器领取远端 mock 任务并写回完成状态。

### 边界控制

- Render 不保存浏览器 Profile、Cookie、二维码、截图或未脱敏平台内容。
- 生产环境变量、Cloudflare token、数据库连接串必须进入 secret manager 或 Render 环境变量，不进 Git。
- 远端部署和域名配置需要人工登录外部平台完成。
- 如果 Access、环境变量或数据库配置未确认，只能继续做本地 mock，不进入远端真实任务。

## 阶段 3：真实微信和朱雀AI私有连接器

### 需求

- 跑通单条真实素材从取材、检测到公众号草稿摘要的链路。
- 真实登录态留在本机或私有仓边界，云端只接收脱敏摘要。

### 预期开发工作

- 在私有边界内实现微信取材、公众号草稿和朱雀AI检测 connector。
- 按公开合同对齐能力：`read_content`、`detect`、`create_draft`、`publish`、`metrics`。
- 将登录过期、验证码、限流、页面变化、平台失败映射为 `action_required`。
- 为真实 connector 准备私有配置、失败分类测试和脱敏检查。

### 验证

- 单条测试链接能读取并生成脱敏摘要。
- 朱雀AI检测能返回脱敏检测摘要。
- 公众号草稿能力只进入草稿或模拟草稿，不自动正式发布。
- 登录过期、验证码和限流场景能进入人工协助队列。
- 公开仓安全扫描确认没有 Profile、Cookie、二维码、截图或原始平台内容。

### 边界控制

- 真实 connector 实现、账号配置、浏览器 Profile 和 Cookie 不进入公开仓。
- 正式发布必须每次人工确认。
- Codex 不绕过验证码、扫码、人机验证或平台风控。
- 如果真实平台页面变化导致不确定，应暂停并报告，而不是盲目扩大自动化。

## 阶段 4：内容工作流产品化

### 需求

- 将“链接取材到公众号草稿”的常用流程做成稳定、可复盘、可审批的工作台。
- 降低人工协助成本，但保留高风险动作确认。

### 预期开发工作

- 增加任务模板：链接取材、热点整理、朱雀检测、改写、公众号草稿、指标回收。
- 优化控制台任务队列、人工协助事项、审批历史和审计摘要。
- 补充邮件提醒或移动端友好的审批入口。
- 完善 AI Link run record 到授权中枢审计的自动回传。

### 验证

- mock 全链路和真实单条链路分别通过 smoke。
- 控制台能清楚区分排队、执行中、待人工、审批中、完成、失败。
- 邮件提醒只包含链接和摘要，不包含正文、截图、token 或平台内容。
- 失败任务能给出续登、验证码、稍后重试、人工处理等下一步建议。

### 边界控制

- 内容生成和草稿可自动化，正式发布不自动化。
- 邮件和控制台不展示未脱敏正文、截图、Cookie 或账号细节。
- 若为了一个模板需要新增大量页面、脚本或抽象，应先拆分为下一轮。
- 不把运营策略、未公开选题和内部判断提前写入公开仓。

## 阶段 5：多平台 connector 扩展

### 需求

- 逐步接入抖音、小红书、知乎、今日头条等平台。
- 每个平台先通过能力合同和只读/草稿能力，再评估发布能力。

### 预期开发工作

- 为每个平台补充 connector 合同测试和失败分类。
- 优先实现 `read_content` 和 `create_draft`，再评估 `publish` 和 `metrics`。
- 对官方 API 明确的平台优先走官方 API；网页登录态只做补位。
- 把平台差异收敛到统一任务、审批和审计模型里。

### 验证

- 每个平台至少有合同测试、mock 测试和失败场景测试。
- 真实平台接入前有私有配置检查和敏感数据扫描。
- 首条真实任务只做只读或草稿，不做正式发布。
- 限流、验证码、登录过期都能进入人工协助路径。

### 边界控制

- 不承诺所有平台同时接入。
- 不做批量搬运、批量私信、自动互动或条款不明确的抓取。
- 平台发布能力必须单独审批。
- 如果平台规则不清楚，默认只保留研究和合同占位，不进入真实实现。

## 阶段 6：治理、运维和成本控制

### 需求

- 让 AI Link 适合长期维护，而不是靠临时人工看护。
- 控制 token、真实 provider 费用、任务失败率和公开/私有边界风险。

### 预期开发工作

- 将 L1 / L2 人工门槛纳入 `next:actions`、`roadmap:next` 或 release decision 报告。
- 增加执行器离线提醒、审批超时策略、任务保留和 artifact 清理。
- 补充 provider 成本摘要、预算门槛和 live 调用审计。
- 建立公开仓与私有仓的脱敏发布流程。

### 验证

- `security:scan`、`verify:fresh`、`release:readiness` 持续通过。
- 成本和 usage estimate 能进入 run record / audit 摘要。
- 知识库镜像只同步公开说明、架构决策和脱敏交接。
- 任务和 artifact 保留策略可通过测试或 dry-run 验证。

### 边界控制

- 长任务必须设置 checkpoint：目标、范围、预算、人工确认点。
- 连续两轮失败或出现范围膨胀，应暂停并重新确认。
- 新工具、新抽象、新页面必须证明用户价值和复用价值。
- 不为“以后可能有用”提前扩大项目体积。

## 阶段 7：SDK / 网页管理台 / 对外产品化

### 需求

- 在 CLI 和授权中枢稳定后，评估是否对外提供 SDK、网页管理台或更完整的产品服务。

### 预期开发工作

- 梳理公开 API、配置 schema、provider/connector plugin 接口。
- 将已验证的 CLI 能力抽象为稳定 SDK 或库入口。
- 设计非技术用户可理解的网页管理界面。
- 明确开源版、私有部署版和个人运营版边界。

### 验证

- 公开 API 有示例、测试和兼容性说明。
- SDK 不暴露私有实现或真实凭据。
- 网页管理台通过本地 smoke、权限检查和脱敏检查。
- 用户路径能从 quickstart 平滑进入高级配置。

### 边界控制

- 第一版不急于做 SDK 或完整平台服务。
- 未验证的运营能力不包装成正式产品承诺。
- 不把私有运营需求伪装成通用公开能力。
- 如果网页管理台导致复杂度快速上升，应回到 CLI / 控制台最小可验证路径。

## 本轮和下一轮建议

建议下一轮只选一个主目标：

1. 关闭 v0.1 发布人工门槛。
2. 做 Render + Cloudflare Access 远端 mock 空跑。
3. 设计真实微信 / 朱雀AI私有 connector 的私有实现边界。
4. 把“边界卡”做成机器可读的 `next:actions` 或 issue 模板。

不建议下一轮同时做真实 connector、远端部署、多平台接入和发布动作。那会同时跨越账号、费用、生产环境和产品承诺边界，容易造成 token 消耗和范围膨胀。
