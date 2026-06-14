# AI Link 用户指引

## 当前阶段

`ai_Link` 当前处于 MVP 第一版阶段。仓库已经建立基础文档、治理流程、知识库镜像、GitHub 同步规则，以及可本地运行的 `ai-link` CLI。

当前定位是：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流。

## 适合谁阅读

- 想了解这个项目当前状态的人。
- 需要接手维护这个仓库的人。
- 准备提交问题、建议或文档改进的人。

## 从哪里开始

1. 先看 `README.md`，了解项目状态和入口。
2. 如果要协作，阅读 `CONTRIBUTING.md`。
3. 如果要提交问题，使用 GitHub issue 模板。
4. 如果发现安全问题，先看 `SECURITY.md`，不要在公开 issue 中贴敏感细节。

## 当前可用内容

- 项目治理文档：`docs/00-governance/`
- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 授权中枢后续规划草案：`docs/10-product/auth-hub-next-steps-draft.md`
- 配置说明：`docs/20-architecture/configuration.md`
- Bitwarden 密钥托管模式：`docs/20-architecture/bitwarden-secret-management.md`
- Provider 说明：`docs/20-architecture/provider-adapters.md`
- Provider 真实调用验收：`docs/20-architecture/provider-live-verification.md`
- Codex Skill 调用约定：`docs/20-architecture/codex-skill-integration.md`
- 统一授权中枢说明：`docs/20-architecture/auth-hub.md`
- 授权中枢部署检查：`docs/20-architecture/auth-hub-deployment-checklist.md`
- Auto Ops 示例：`examples/auto-ops/`
- 项目账本：`docs/project-ledger/`
- 文档模板：`docs/90-templates/`
- 本地检查和知识库同步脚本：`tools/`

## 快速试用

```powershell
npm install
npm run ai-link -- doctor
npm run ai-link -- config validate
npm run ai-link -- providers list
npm run providers:dry
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿"
npm run ai-link -- run auto_ops.research --dry-run --input "调研一个公开选题"
```

如果没有外部模型 API key，可以先使用 `mock`：

```powershell
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```

`workflow run` 会按配置串联多个阶段。默认 `auto_ops` 示例会先运行 `auto_ops.research`，再把调研输出交给 `auto_ops.article_draft`。Codex skill 示例见 `examples/codex-skills/auto-ops-ai-link/SKILL.md`。

## 统一授权中枢本地试跑

授权中枢用于把跨平台任务拆成“云端私有控制台 + 本地执行器 + 人工确认发布”。本地开发可用：

```powershell
npm run auth-hub:local:start
npm run auth-hub:secrets:new
npm run auth-hub:deploy:check
npm run auth-hub:smoke
npm run auth-hub:executor:start
```

本地默认开发密码和令牌只用于试跑。公网部署前必须改用强随机值，并把控制台放在 Cloudflare Access 后面，同时开启应用自身的 Access origin guard。真实平台账号、浏览器 Profile、Cookie、二维码、截图和未脱敏内容只能放在本机私有位置，例如 `runtime/private/`。

停止本地执行器和控制台：

```powershell
npm run auth-hub:executor:stop
npm run auth-hub:local:stop
```

## 外部模型配置

真实调用 DeepSeek、Kimi、Grok 或 OpenAI-compatible provider 前，推荐进入 BWS 密钥托管模式：API key 放在 Bitwarden Secrets Manager，本地 Codex / AI Link 通过 `bws run` 临时注入环境变量。

```powershell
$env:AI_LINK_BWS_PROJECT_ID="<ai-link-local-dev-project-id>"
$env:BWS_ACCESS_TOKEN="<machine-account-access-token>"
powershell -ExecutionPolicy Bypass -File tools/check-bitwarden-secrets.ps1
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"
```

Bitwarden Secret key 必须直接等于环境变量名，例如 `DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`XAI_API_KEY`。Secret value 才是真实值。不要把真实 key 写入公开仓库、issue、PR、知识库或聊天记录。完整流程见 `docs/20-architecture/bitwarden-secret-management.md`。

公开仓中的 `.ai-link/bitwarden-secrets.manifest.json` 只记录预期环境变量名，用来帮助 `tools/check-bitwarden-secrets.ps1` 检查 Bitwarden 项目是否配置完整，不包含任何真实密钥。

## 当前不可假设

- 不要假设所有 provider 的高级能力都已经完整实现。
- 不要假设扣子工作流已在 MVP runtime 中可真实调用；当前是预留接口。
- 不要假设统一授权中枢已经支持真实微信、朱雀AI、抖音、小红书、知乎或头条账号自动化；公开 MVP 目前只启用 mock 连接器和真实连接器边界。
- 不要把私密数据、账号、token、二维码、登录态或未脱敏截图提交到 issue、PR 或仓库文件。
- 不要把 `BWS_ACCESS_TOKEN` 写入项目文件；它只允许存在于当前本机会话环境中。
- 不要把私有内部仓中的草稿、判断或实验结果视为公开承诺；公开仓内容才是对外口径。

## 仓库边界

- 公开仓 `xiaoqi-AI/ai_Link`：用户指引、公开代码、公开文档、反馈模板和安全说明。
- 私有仓 `xiaoqi-AI/ai_Link-internal`：内部规划、实验、公开发布门禁和非公开维护记录。

外部用户只需要关注公开仓。内部材料只有经过脱敏、整理和用户指引检查后，才会同步到公开仓。

## 反馈方式

- 普通问题：使用 `Bug report` issue 模板。
- 新需求或想法：使用 `Feature request` issue 模板。
- 文档问题：使用 `Documentation update` issue 模板。
- 安全问题：参考 `SECURITY.md`。

## 维护者验证

公开仓维护者提交前建议运行：

```powershell
npm run check
npm test
npm run ai-link -- config validate
npm run providers:dry
npm run workflow:dry
npm run security:scan
npm run verify:fresh
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

`npm run verify:fresh` 会把当前 Git 提交克隆到临时目录，重新执行安装、检查、测试、配置校验、CLI dry-run 和安全扫描，用来模拟外部用户 fresh clone 后的体验。
