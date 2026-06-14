# AI Link 工作空间

`ai_Link` 是一个公开 GitHub 项目，目标是让 Codex 能按任务链接合适的模型、Agent 和工作流。当前第一版 MVP 已建立 TypeScript / Node.js CLI 骨架、配置分层、provider adapter、路由、策略和 auto-ops 示例；策略层已支持出站审批、provider type 门禁、模型名模式门禁、预算估算和审计元数据。

## 当前状态

- 阶段：MVP 第一版
- 定位：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流
- GitHub：`https://github.com/xiaoqi-AI/ai_Link`
- 可见性：公开仓库
- 默认分支：`main`
- 本地路径：`G:\codex_workpace\ai_Link`
- 知识库镜像：`D:\llm-wiki\wiki\projects\ai_Link`
- 内部私有仓：`https://github.com/xiaoqi-AI/ai_Link-internal`
- 业务范围：待确认，不在初始化文档中提前定案

## 用户入口

- 使用指引：`docs/user-guide.md`
- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 授权中枢后续规划草案：`docs/10-product/auth-hub-next-steps-draft.md`
- 配置说明：`docs/20-architecture/configuration.md`
- Bitwarden 密钥托管模式：`docs/20-architecture/bitwarden-secret-management.md`
- Provider 说明：`docs/20-architecture/provider-adapters.md`
- Provider 真实调用验收：`docs/20-architecture/provider-live-verification.md`
- 连接器合同：`docs/20-architecture/connector-contracts.md`
- Codex Skill 调用约定：`docs/20-architecture/codex-skill-integration.md`
- 统一授权中枢：`docs/20-architecture/auth-hub.md`
- 授权中枢部署检查：`docs/20-architecture/auth-hub-deployment-checklist.md`
- Auto Ops 示例：`examples/auto-ops/`
- BWS Codex Skill 示例：`examples/codex-skills/bws-secret-mode/SKILL.md`
- 协作规则：`AGENTS.md`
- 贡献说明：`CONTRIBUTING.md`
- 安全反馈：`SECURITY.md`
- 治理说明：`docs/00-governance/workspace-governance.md`
- GitHub 维护规则：`docs/00-governance/public-github-maintenance.md`
- 用户指引维护规则：`docs/00-governance/user-guidance-policy.md`
- 待确认问题：`docs/00-governance/open-questions.md`

## 常用维护命令

```powershell
npm run check
npm test
npm run onboard:print
npm run onboard:json
npm run onboard:check
npm run package:check
npm run package:check:json
npm run release:readiness
npm run release:readiness:json
npm run skills:check
npm run ai-link -- config validate
npm run bws:plan
npm run bws:onboard
npm run bws:profile:print
npm run bws:activate:plan
npm run bws:check
npm run bws:session:help
npm run bws:worksheet
npm run bws:rotation:print
npm run bws:github-vars:help
npm run bws:github-vars:apply-plan
npm run bws:acceptance:print
npm run providers:dry:json
npm run providers:github:dispatch-plan
npm run security:scan
npm run verify:fresh
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

## 快速试用

```powershell
npm install
npm run onboard:print
npm run onboard:json
npm run onboard:check
npm run package:check
npm run package:check:json
npm run release:readiness
npm run release:readiness:json
npm run ai-link -- doctor
npm run ai-link -- config validate
npm run ai-link -- providers list
npm run providers:dry
npm run providers:dry:json
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿"
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿" --output runtime/tmp/auto-ops-workflow.json
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿" --record
npm run ai-link -- runs list
npm run ai-link -- workflow run auto_ops --dry-run --stages research --input "先做调研" --record
npm run ai-link -- workflow run auto_ops --dry-run --resume-from latest --input "接着写初稿"
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，Codex 负责落地"
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi" --write .ai-link/local.yaml --diff
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi" --write .ai-link/local.yaml --diff --json
npm run ai-link -- run auto_ops.agent_flow --dry-run --input "验证 Coze agent 工作流"
npm run ai-link -- run auto_ops.research --dry-run --input "调研一个公开选题"
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```

真实外部模型调用需要用户自行配置 API key，例如 `DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`ARK_API_KEY`、`XAI_API_KEY`。推荐把真实 key 放在 Bitwarden Secrets Manager 中，再用 `bws run` 临时注入环境变量；公开仓不会保存真实密钥。

```powershell
$env:AI_LINK_BWS_PROJECT_ID="<ai-link-local-dev-project-id>"
$env:AI_LINK_BWS_CI_PROJECT_ID="<ai-link-ci-project-id>"
npm run bws:plan
npm run bws:onboard
npm run bws:profile
npm run bws:activate
npm run bws:worksheet
npm run bws:rotation
npm run bws:github-vars
npm run bws:github-vars:apply-plan
npm run bws:acceptance
npm run bws:session
npm run bws:check:strict
npm run bws:acceptance:strict
npm run bws:doctor
npm run providers:live:safe-report
npm run providers:github:dispatch-plan
```

`onboard:print` 会输出一页不含密钥的公开用户入场引导：当前项目配置、可用 provider / route / workflow、第一条 dry-run 路径、自然语言 skill 草稿预览、BWS 密钥托管入口和收尾检查。需要机器可读状态时，用 `npm run onboard:json` 或 `npm run ai-link -- onboard --json`；需要 CI/其他 agent 用退出码判定时，用 `npm run onboard:check` 或 `npm run ai-link -- onboard --json --strict`；需要保存到本地运行态时，用 `npm run onboard` 写入 `runtime/tmp/ai-link-onboarding.md`；该文件默认不进入 Git。`package:check` 会先重新构建运行时产物，再用 `npm pack --dry-run` 模拟打包并确认包内不含源码测试、运行态、自动化目录或敏感本地文件；机器可读版本用 `package:check:json`，它不会发布到 npm。`release:readiness` 会输出 v0.1 公开发布基线报告，把已满足项和 GitHub UI / npm 发布决策这类人工确认项分开；机器可读版本用 `release:readiness:json`。`providers:dry:json` 会输出 provider 验收摘要，包含 `summary.ok`、`summary.counts` 和逐个 provider 状态，适合 Codex skill、CI 或其他 agent 判定 dry-run 是否可用。

`bws:onboard` 会生成不含真实密钥的一页入场引导到 `runtime/tmp/bws-onboarding.md`，汇总当前状态、目标结构和下一步动作；`bws:profile` 会生成只包含非敏感 Bitwarden project ID 的本地 PowerShell 片段到 `runtime/tmp/bws-local-profile.ps1`，不保存 `BWS_ACCESS_TOKEN`；`bws:activate` 会分两段隐藏输入本地 Codex machine account token 和 GitHub Actions machine account token，分别验收 `ai-link-local-dev` 与 `ai-link-ci`，不落盘 token；`bws:worksheet` 会生成不含真实密钥的本地实配工作单到 `runtime/tmp/bws-setup-worksheet.md`；`bws:rotation` 会生成不含真实 token 的 90 天轮换计划和验收证据清单；`bws:github-vars` 会从 Bitwarden CI 项目读取 secret ID 并生成 GitHub Environment variable 填写清单，不输出 secret value；`bws:github-vars:apply-plan` 会预览自动写入 GitHub Environment Variables 的计划，真正写入时用 `bws:github-vars:apply`，但 `BW_ACCESS_TOKEN` 仍需作为 GitHub Environment Secret 单独安全设置；`bws:acceptance` 会生成不含真实密钥的 BWS 验收报告，配置完成后用 `bws:acceptance:strict` 做正式验收；`bws:session` 会在缺少 `BWS_ACCESS_TOKEN` 时隐藏输入 token，并且只在当前子命令里临时使用；`bws:doctor` 会通过 `bws run` 注入 Bitwarden Secrets Manager 里的 provider key 后再执行 `doctor`；`providers:live:safe-report` 会把真实 provider 验收结果写入 `runtime/tmp/provider-live-report.json`，只保留脱敏摘要，适合人工复盘或 GitHub Actions artifact。

## 统一授权中枢 MVP

本仓库新增一个私有授权中枢的公开 MVP 骨架，用于减少 Codex 在跨平台运营任务中反复等待人工登录的成本。

```powershell
npm run auth-hub:local:start
npm run auth-hub:secrets:new
npm run auth-hub:deploy:check
npm run auth-hub:smoke
npm run auth-hub:audit-smoke
npm run auth-hub:executor:start
```

默认本地开发令牌只适合本机试跑；部署到 Render 或其他公网环境前，必须配置 `AI_LINK_APP_PASSWORD`、`AI_LINK_SESSION_SECRET`、`AI_LINK_ADMIN_TOKEN`、`AI_LINK_EXECUTOR_TOKEN` 和 Cloudflare Access origin guard。高价值平台的浏览器登录态应放在本机 `runtime/private/`，不上传 Render、不进 Git、不进知识库。

第一版只启用 mock 微信/朱雀连接器，能跑通任务创建、执行器领取、模拟取材检测、草稿摘要、发布前确认和发布后完成状态。`auth-hub:audit-smoke` 会启动或复用本地授权中枢，创建测试任务，运行 AI Link dry-run workflow 生成本地 run record，再用 `runs submit-audit` 回传审计并验证 `GET /api/audit?eventType=ai_link.audit`。控制台和 `GET /api/connectors` 会展示公开安全的连接器合同状态；真实平台连接器应放在私有配置或私有仓中实现。

停止本地服务：

```powershell
npm run auth-hub:executor:stop
npm run auth-hub:local:stop
```

重要会话结束时可运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-closeout.ps1 -Summary "本次完成的事情"
```

## 公开仓库维护原则

- 每次更新后，同步维护本地仓库、GitHub 远端和个人知识库镜像。
- 每次影响安装、启动、使用方式、交互流程或限制条件时，同步更新 `README.md` 和 `docs/user-guide.md`。
- 每次新增面向外部用户的行为时，补充 issue/PR 指引或相关说明。
- 不把密钥、token、二维码、登录状态、未脱敏截图、个人财务或交易信息、运行缓存、构建产物写入 Git 或知识库。

## 公开 / 私有双仓模式

本仓库是对外主仓，只放可以公开给用户和贡献者看的内容。内部规划、实验、供应商评估、运维说明和公开前审查放在私有 companion 仓 `xiaoqi-AI/ai_Link-internal`。

从内部仓同步到公开仓前，必须完成脱敏和用户指引检查。公开仓不接收内部路径、内部判断、未确认承诺、账号信息或任何敏感资料。

## 当前产品能力

当前已经具备：

- `ai-link` CLI 本地运行入口。
- 配置优先级：会话临时指定 > 项目 local 私有配置 > 项目公开配置 > 用户全局配置 > 默认配置。
- `mock/local-dry-run`、`openai-compatible`、`deepseek`、`kimi`、`doubao`、`grok` provider。
- `coze` agent provider dry-run 和本地命令适配。
- `ai-link config validate` 配置校验。
- `package:check` npm dry-run 打包内容检查，确认公开包不携带测试产物、运行态或私有文件。
- `release:readiness` v0.1 公开发布基线检查。
- `ai-link providers verify` provider dry-run / live 验收，`--json` 会输出带 `summary` 的机器可读报告，`--safe` 会生成脱敏摘要。
- `ai-link workflow run` 多阶段工作流串联，默认示例支持 Grok 调研后交给 Kimi 写草稿。
- `ai-link run` / `ai-link workflow run` 支持 `--json` 和 `--output runtime/tmp/*.json`，`skill draft --write --diff --json` 支持结构化合并摘要，方便 Codex skill 稳定读取结果。
- `ai-link run` / `ai-link workflow run` 支持 `--record`，把本地运行记录写入 `runtime/tmp/ai-link-runs/`；`ai-link runs list/show` 可查看本地运行索引和单次记录，`workflow run --resume-from` 可从本地 workflow 记录续跑。
- route policy 会执行 `allowOutbound` 出站规则、provider type 限制、model pattern gate 和预算 gate；默认真实外部 provider 调用需要 `--approve-policy`、`--approve-stage <stage>` 或 `--approve-all`，`agent_flow` 还会标记为 `external_action` 并在结果/运行记录中保留审计 metadata。
- 敏感信息出站拦截策略。
- Codex skill 自然语言生成候选 route + workflow 配置。
- `examples/auto-ops/`、`examples/codex-skills/auto-ops-ai-link/` 和 `examples/codex-skills/bws-secret-mode/` 轻量示例。
- 私有授权中枢公开骨架：任务 API、控制台登录、审批流、审计日志、本地执行器、mock 平台连接器和连接器合同状态 API；执行器可回传 AI Link `audit` 摘要，Codex 也可用 `ai-link runs submit-audit` 把本地 run record 审计追加到任务详情、控制台审计页和 `GET /api/audit`，审计日志支持按 `eventType` 筛选。
- GitHub Actions CI、fresh clone 验证脚本和本地安全扫描。

## 许可证

本项目使用 Apache-2.0 许可证。
