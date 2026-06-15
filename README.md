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

- 5 分钟快速试用：`docs/quickstart.md`
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
npm run package:install-smoke
npm run package:install-smoke:json
npm run next:actions
npm run next:actions:json
npm run setup:handoff
npm run setup:handoff:json
npm run maintainer:pack
npm run maintainer:pack:json
npm run external:preflight
npm run external:preflight:json
npm run roadmap:next
npm run roadmap:next:json
npm run bws:next
npm run bws:next:json
npm run bws:run:help
npm run github:safety
npm run github:safety:json
npm run github:hardening
npm run github:hardening:json
npm run github:hardening:next
npm run github:hardening:next:json
npm run release:plan
npm run release:plan:json
npm run release:decisions
npm run release:decisions:json
npm run release:decisions:strict
npm run release:decisions:next
npm run release:decisions:next:json
npm run release:decisions:update
npm run release:manual-gates
npm run release:manual-gates:json
npm run release:evidence
npm run release:evidence:json
npm run release:readiness
npm run release:readiness:json
npm run skills:check
npm run ai-link -- config validate
npm run bws:plan
npm run bws:next
npm run bws:onboard
npm run bws:profile:print
npm run bws:activate:plan
npm run bws:check
npm run bws:session:help
npm run bws:run:help
npm run bws:worksheet
npm run bws:rotation:print
npm run bws:github-vars:help
npm run bws:github-vars:apply-plan
npm run bws:acceptance:print
npm run bws:acceptance:json
npm run providers:dry:json
npm run maintainer:pack
npm run external:preflight
npm run roadmap:next
npm run github:hardening:next
npm run providers:github:dispatch-plan
npm run security:scan
npm run verify:fresh
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

## 5 分钟快速试用

完整短路径见 `docs/quickstart.md`。下面这组命令不需要真实 provider key，也不会调用外部模型：

```powershell
npm ci
npm run onboard:print
npm run ai-link -- config validate
npm run providers:dry
npm run workflow:dry
npm run ai-link -- skill draft --skill auto_ops --description "research with Grok, article draft with Kimi" --write .ai-link/local.yaml --diff --json
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```

维护者继续推进时，可以先运行 `npm run external:preflight` 确认外部设置前的本地状态，再运行 `npm run roadmap:next` 查看 v0.1 / v0.2 / 后续 SDK 与连接器阶段路线；两者都不会读取或打印密钥。

真实外部模型调用需要用户自行配置 API key，例如 `DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`ARK_API_KEY`、`XAI_API_KEY`。推荐把真实 key 放在 Bitwarden Secrets Manager 中，再用 `bws run` 临时注入环境变量；公开仓不会保存真实密钥。

```powershell
$env:AI_LINK_BWS_PROJECT_ID="<ai-link-local-dev-project-id>"
$env:AI_LINK_BWS_CI_PROJECT_ID="<ai-link-ci-project-id>"
npm run bws:plan
npm run bws:next
npm run bws:onboard
npm run bws:profile
npm run bws:activate
npm run bws:worksheet
npm run bws:rotation
npm run bws:github-vars
npm run bws:github-vars:apply-plan
npm run bws:acceptance
npm run bws:acceptance:json
npm run bws:session
npm run bws:check:strict
npm run bws:acceptance:strict
npm run bws:doctor
npm run bws:run -- -CommandLine "npm run ai-link -- doctor"
npm run bws:run -- -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""测试"""
npm run providers:live:safe-report
npm run providers:github:dispatch-plan
```

`onboard:print` 会输出一页不含密钥的公开用户入场引导：当前项目配置、可用 provider / route / workflow、第一条 dry-run 路径、自然语言 skill 草稿预览、BWS 密钥托管入口和收尾检查。需要机器可读状态时，用 `npm run onboard:json` 或 `npm run ai-link -- onboard --json`；需要 CI/其他 agent 用退出码判定时，用 `npm run onboard:check` 或 `npm run ai-link -- onboard --json --strict`；需要保存到本地运行态时，用 `npm run onboard` 写入 `runtime/tmp/ai-link-onboarding.md`；该文件默认不进入 Git。`package:check` 会先重新构建运行时产物，再用 `npm pack --dry-run` 模拟打包并确认包内不含源码测试、运行态、自动化目录或敏感本地文件；机器可读版本用 `package:check:json`，它不会发布到 npm。`package:install-smoke` 会把本地 tarball 安装到临时空项目里，再运行安装后的 `ai-link --version` 和 `config validate`；机器可读版本用 `package:install-smoke:json`，它同样不会发布到 npm。`next:actions` 会输出当前最高优先级的下一步行动图，把本地基线、GitHub 加固、Bitwarden 配置、provider-live Environment、成本审批和 v0.1 发布决策放到一张表里；机器可读版本用 `next:actions:json`，不会读取密钥或修改远端设置。`external:preflight` 会在真正进入 Bitwarden 或 GitHub UI 前做一次只读 go/no-go 检查，确认公开仓是否干净、是否同步、来源报告是否可用；机器可读版本用 `external:preflight:json`，不会读取密钥或修改外部系统。`roadmap:next` 会输出公开安全路线图，把 v0.1 本地基线、外部人工门槛、v0.2 真实 provider 验收、skill 创作、agent/connector 扩展和后续 SDK 拆成阶段；机器可读版本用 `roadmap:next:json`。`github:safety` 会检查公开仓本地治理基线；如果本机安装并登录了 `gh`，或当前会话设置了 `GH_TOKEN` / `GITHUB_TOKEN`，还会只读核验远端 branch protection、secret scanning 和 push protection 状态；机器可读版本用 `github:safety:json`，不会修改 GitHub 设置，也不会输出 token。`release:plan` 会检查 `CHANGELOG.md`、GitHub Release 草稿、发布流程文档、tag 计划和 npm 发布决策项；机器可读版本用 `release:plan:json`，不会创建 tag 或发布 npm。`release:manual-gates` 会输出 v0.1 人工门槛计划，把 GitHub 保护、secret scanning / push protection、npm 发布决策和 provider-live 成本审批拆成 owner、动作、完成证据和安全边界；机器可读版本用 `release:manual-gates:json`，不会修改 GitHub、创建 tag、发布 npm 或触发真实 provider。`release:evidence` 会汇总 onboarding、包检查、下一步行动、GitHub 安全、发布计划、人工门槛和发布就绪摘要，并把 JSON 写入 `runtime/tmp/release-evidence.json`；机器可读版本用 `release:evidence:json`，默认不写文件。`release:readiness` 会输出 v0.1 公开发布基线报告，把已满足项和 GitHub UI / npm 发布决策这类人工确认项分开；机器可读版本用 `release:readiness:json`。`providers:dry:json` 会输出 provider 验收摘要，包含 `summary.ok`、`summary.counts` 和逐个 provider 状态，适合 Codex skill、CI 或其他 agent 判定 dry-run 是否可用。

`bws:next` 会输出当前 Bitwarden 设置状态和下一条安全命令，只报告 project id、`BWS_ACCESS_TOKEN`、`GH_TOKEN` / `GITHUB_TOKEN` 是否存在，不打印任何值；BWS 辅助工具会优先识别 `AI_LINK_BWS_CLI_PATH`，然后识别 PATH 和 Bitwarden Secrets Manager 的 Windows 默认安装路径。`bws:onboard` 会生成不含真实密钥的一页入场引导到 `runtime/tmp/bws-onboarding.md`，汇总当前状态、目标结构和下一步动作；`bws:profile` 会生成只包含非敏感 Bitwarden project ID 的本地 PowerShell 片段到 `runtime/tmp/bws-local-profile.ps1`，不保存 `BWS_ACCESS_TOKEN`；`bws:activate` 会分两段隐藏输入本地 Codex machine account token 和 GitHub Actions machine account token，分别验收 `ai-link-local-dev` 与 `ai-link-ci`，不落盘 token；`bws:worksheet` 会生成不含真实密钥的本地实配工作单到 `runtime/tmp/bws-setup-worksheet.md`；`bws:rotation` 会生成不含真实 token 的 90 天轮换计划和验收证据清单；`bws:github-vars` 会从 Bitwarden CI 项目读取 secret ID 并生成 GitHub Environment variable 填写清单，不输出 secret value；`bws:github-vars:apply-plan` 会预览自动写入 GitHub Environment Variables 的计划，真正写入时用 `bws:github-vars:apply`，但 `BW_ACCESS_TOKEN` 仍需作为 GitHub Environment Secret 单独安全设置；`bws:acceptance` 会生成不含真实密钥的 BWS 验收报告，`bws:acceptance:json` 输出同一验收状态的机器可读版本，配置完成后用 `bws:acceptance:strict` 做正式验收；`bws:session` 会在缺少 `BWS_ACCESS_TOKEN` 时隐藏输入 token，并且只在当前子命令里临时使用；`bws:doctor` 会通过 `bws run` 注入 Bitwarden Secrets Manager 里的 provider key 后再执行 `doctor`；`providers:live:safe-report` 会把真实 provider 验收结果写入 `runtime/tmp/provider-live-report.json`，只保留脱敏摘要，适合人工复盘或 GitHub Actions artifact。

`release:decisions:next` 会根据当前 `docs/releases/v0.1.0-decisions.json` 为每个 pending 决策生成公开安全的预览命令和写入命令；`release:decisions:update` 用于把人工确认后的 v0.1 决策安全写入记录。它默认只预览，只有加 `--yes` 才会写入；`approved` 必须带公开安全 evidence，`waived` 必须带公开安全 note，并会拒绝常见密钥形态。

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
- `package:install-smoke` 临时 tarball 安装检查，确认安装后的 CLI 能启动并校验配置。
- `next:actions` 当前下一步行动图，汇总本地基线、GitHub 加固、Bitwarden 配置、provider-live 和 v0.1 发布决策。
- `setup:handoff` 有序配置交接单，把本地基线、Bitwarden、GitHub provider-live、GitHub 加固、release decisions、provider-live 成本审批和发布渠道决策串成一条安全执行路径。
- `maintainer:pack` 维护者操作包，把 GitHub UI、Bitwarden、provider-live、release decisions 和发布渠道的安全动作折叠成一张可执行清单。
- `external:preflight` 外部设置前 go/no-go 闸口，确认公开仓干净、已同步、来源报告可用后再去 Bitwarden 或 GitHub UI。
- `roadmap:next` 后续路线图，把 v0.1 本地基线、外部人工门槛、v0.2 真实 provider 验收、skill 创作、agent/connector 扩展和后续 SDK 拆成公开安全阶段。
- `bws:next` Bitwarden 设置状态导航，显示下一条安全命令且不打印 token 或 project id 值。
- `github:safety` GitHub 公开仓安全基线检查，支持本地基线、已登录 `gh` 和 `GH_TOKEN` / `GITHUB_TOKEN` 远端只读核验。
- `github:hardening` GitHub 加固工作单，生成 branch protection、required Verify、secret scanning 和 push protection 的人工配置与验收清单。
- `github:hardening:next` GitHub 加固下一步导航，显示 UI 链接、验收命令和公开安全的 release decision 更新预览。
- `release:plan` v0.1 发布计划检查，覆盖 changelog、release notes、tag、npm 决策和发布流程。
- `release:decisions` v0.1 公开安全决策记录检查，把 GitHub 加固、npm 渠道和 provider-live 成本审批的 pending/approved/waived 状态变成机器可读门槛。
- `release:decisions:next` v0.1 决策记录下一步命令生成入口，为每个 pending 决策输出 preview / write 命令。
- `release:decisions:update` v0.1 决策记录安全更新入口，默认只预览；加 `--yes` 后才写入公开安全证据。
- `release:manual-gates` v0.1 人工门槛计划，列出 GitHub 保护、secret scanning / push protection、npm 发布决策和 provider-live 成本审批的 owner、动作与完成证据。
- `release:evidence` v0.1 发布证据包，汇总安全的机器可读检查摘要并写入 `runtime/tmp/release-evidence.json`。
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
