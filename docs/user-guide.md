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

- 5 分钟快速试用：`docs/quickstart.md`
- 项目治理文档：`docs/00-governance/`
- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 授权中枢后续规划草案：`docs/10-product/auth-hub-next-steps-draft.md`
- 配置说明：`docs/20-architecture/configuration.md`
- Bitwarden 密钥托管模式：`docs/20-architecture/bitwarden-secret-management.md`
- Provider 说明：`docs/20-architecture/provider-adapters.md`
- Provider 真实调用验收：`docs/20-architecture/provider-live-verification.md`
- 连接器合同：`docs/20-architecture/connector-contracts.md`
- Codex Skill 调用约定：`docs/20-architecture/codex-skill-integration.md`
- 统一授权中枢说明：`docs/20-architecture/auth-hub.md`
- 授权中枢部署检查：`docs/20-architecture/auth-hub-deployment-checklist.md`
- Auto Ops 示例：`examples/auto-ops/`
- BWS Codex Skill 示例：`examples/codex-skills/bws-secret-mode/SKILL.md`
- 项目账本：`docs/project-ledger/`
- 文档模板：`docs/90-templates/`
- 本地检查和知识库同步脚本：`tools/`

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

`onboard:print` 会输出一页不含密钥的公开用户入场引导，覆盖当前项目配置、第一条 dry-run 路径、自然语言 skill 草稿预览、BWS 密钥托管入口和收尾检查。需要机器可读状态时，用 `npm run onboard:json` 或 `npm run ai-link -- onboard --json`；需要 CI/其他 agent 用退出码判定时，用 `npm run onboard:check` 或 `npm run ai-link -- onboard --json --strict`；需要保存到本地运行态时，用 `npm run onboard` 写入 `runtime/tmp/ai-link-onboarding.md`；该文件默认不进入 Git。`package:check` 会先重新构建运行时产物，再用 `npm pack --dry-run` 模拟打包并确认包内不含源码测试、运行态、自动化目录或敏感本地文件；机器可读版本用 `package:check:json`，它不会发布到 npm。`package:install-smoke` 会把本地 tarball 安装到临时空项目里，再运行安装后的 `ai-link --version` 和 `config validate`；机器可读版本用 `package:install-smoke:json`，它同样不会发布到 npm。`next:actions` 会输出当前最高优先级的下一步行动图，把本地基线、GitHub 加固、Bitwarden 配置、provider-live Environment、成本审批和 v0.1 发布决策放到一张表里；机器可读版本用 `next:actions:json`，不会读取密钥或修改远端设置。`external:preflight` 会在真正进入 Bitwarden 或 GitHub UI 前做一次只读 go/no-go 检查，确认公开仓是否干净、是否同步、来源报告是否可用；机器可读版本用 `external:preflight:json`，不会读取密钥或修改外部系统。`roadmap:next` 会输出公开安全路线图，把 v0.1 本地基线、外部人工门槛、v0.2 真实 provider 验收、skill 创作、agent/connector 扩展和后续 SDK 拆成阶段；机器可读版本用 `roadmap:next:json`。`github:safety` 会检查公开仓本地治理基线；如果本机安装并登录了 `gh`，或当前会话设置了 `GH_TOKEN` / `GITHUB_TOKEN`，还会只读核验远端 branch protection、secret scanning 和 push protection 状态；机器可读版本用 `github:safety:json`，不会修改 GitHub 设置，也不会输出 token。`release:plan` 会检查 `CHANGELOG.md`、GitHub Release 草稿、发布流程文档、tag 计划和 npm 发布决策项；机器可读版本用 `release:plan:json`，不会创建 tag 或发布 npm。`release:decisions:update` 会把人工确认后的 v0.1 决策写入公开安全记录，默认只预览，只有加 `--yes` 才会写入，并且会拒绝疑似密钥内容。`release:manual-gates` 会输出 v0.1 人工门槛计划，把 GitHub 保护、secret scanning / push protection、npm 发布决策和 provider-live 成本审批拆成 owner、动作、完成证据和安全边界；机器可读版本用 `release:manual-gates:json`，不会修改 GitHub、创建 tag、发布 npm 或触发真实 provider。`release:evidence` 会汇总 onboarding、包检查、下一步行动、GitHub 安全、发布计划、人工门槛和发布就绪摘要，并把 JSON 写入 `runtime/tmp/release-evidence.json`；机器可读版本用 `release:evidence:json`，默认不写文件。`release:readiness` 会输出 v0.1 公开发布基线报告，把仓库内已满足项和 GitHub UI / npm 发布决策这类人工确认项分开；机器可读版本用 `release:readiness:json`。`providers:dry:json` 会输出 provider 验收摘要，包含 `summary.ok`、`summary.counts` 和逐个 provider 状态，适合 Codex skill、CI 或其他 agent 判定 dry-run 是否可用。

`release:decisions:next` 会为每个 pending 决策生成公开安全的预览命令和写入命令。维护者应先运行 `release:decisions:next` 复核命令，再用 `release:decisions:update` 预览单条决策，最后确认安全后才加 `--yes`。

如果没有外部模型 API key，可以先使用 `mock`：

```powershell
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```

`skill draft` 会把自然语言说明转换成候选 `routes` 和 `workflows`；加 `--write .ai-link/local.yaml` 时默认只预览，只有再加 `--yes` 才会写入；加 `--diff` 会额外列出本次合并将新增或更新哪些 `routes`、`workflows` 和 `policies`；再加 `--json` 会输出机器可读的 `target`、`previewOnly`、`merged`、`draft` 和 `diff`。`workflow run` 会按配置串联多个阶段。默认 `auto_ops` 示例会依次运行 Grok 调研、Kimi 写稿和 Coze agent workflow dry-run。需要给后续 Codex 步骤稳定交接时，用 `--output runtime/tmp/*.json` 写入结构化结果；需要保留本地运行索引时，可以加 `--record`，记录会写入 `runtime/tmp/ai-link-runs/`，随后用 `runs list` 查看最近记录、用 `runs show <id>` 查看单条记录。多阶段任务可以先用 `--stages research --record` 留下阶段记录，再用 `--resume-from latest` 或 `--resume-from <id>` 续跑剩余阶段；需要从某个阶段重跑时，加 `--from-stage article_draft`。这些运行产物默认不进入 Git；`--record` 不会在 request 里单独保存原始 input，但 provider 输出可能回显任务内容，所以仍只适合留在本地临时目录。Codex skill 示例见 `examples/codex-skills/auto-ops-ai-link/SKILL.md`；进入 BWS 密钥托管模式时，示例见 `examples/codex-skills/bws-secret-mode/SKILL.md`。

默认 policy 使用 `allowOutbound: user-approved`，所以真实调用 DeepSeek、Kimi、豆包、Grok、OpenAI-compatible 或 Coze 等外部 provider 前都需要人工批准；dry-run 只显示审批提示。直接 `run` 真实调用前需要加 `--approve-policy`，通过 workflow 真实运行前需要加对应的 `--approve-stage <stage>`，完整工作流可用 `--approve-all`。`auto_ops.agent_flow` 额外标记为 `external_action` policy，只允许 `coze` / `mock` 这类 agent workflow 路径，并在结果 metadata 中保留审计标签和数据分类。policy 还可以配置 `allowedModels`、`blockedModels` 和 `budget`，在密钥可用前先限制可用模型与单次调用预算；`--record` 生成的本地运行记录会额外写入顶层 `audit` 摘要，方便后续复盘或接授权中枢。

## 统一授权中枢本地试跑

授权中枢用于把跨平台任务拆成“云端私有控制台 + 本地执行器 + 人工确认发布”。本地开发可用：

```powershell
npm run auth-hub:local:start
npm run auth-hub:secrets:new
npm run auth-hub:deploy:check
npm run auth-hub:smoke
npm run auth-hub:audit-smoke
npm run auth-hub:executor:start
```

本地默认开发密码和令牌只用于试跑。公网部署前必须改用强随机值，并把控制台放在 Cloudflare Access 后面，同时开启应用自身的 Access origin guard。真实平台账号、浏览器 Profile、Cookie、二维码、截图和未脱敏内容只能放在本机私有位置，例如 `runtime/private/`。

控制台首页会展示公开安全的连接器状态；只读 API `GET /api/connectors` 也可读取平台能力契约，用来确认微信、朱雀AI和预留平台当前是可用、预留还是配置异常。执行器回传 AI Link `audit` 摘要后，任务详情页、控制台审计页和 `GET /api/audit` 会显示 provider、model、policy、审批、预算和 usage estimate，便于复盘但不暴露原始输入、输出或密钥。本地 run record 也可以用 `npm run ai-link -- runs submit-audit latest --task-id <auth-hub-task-id>` 追加到授权中枢审计日志；需要只看 AI Link 审计时，可打开 `/dashboard/audit?eventType=ai_link.audit` 或调用 `GET /api/audit?eventType=ai_link.audit`。要验证整条本地交接链路，可直接运行 `npm run auth-hub:audit-smoke`，它会用 dry-run workflow 生成本地记录并回传审计。

停止本地执行器和控制台：

```powershell
npm run auth-hub:executor:stop
npm run auth-hub:local:stop
```

## 外部模型配置

真实调用 DeepSeek、Kimi、豆包、Grok 或 OpenAI-compatible provider 前，推荐进入 BWS 密钥托管模式：API key 放在 Bitwarden Secrets Manager，本地 Codex / AI Link 通过 `bws run` 临时注入环境变量。

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
npm run bws:check
npm run bws:run:help
```

普通公开用户建议先用 `npm run onboard:print` 完成本地 dry-run 入场；准备配置真实 provider key 时，再进入 BWS 密钥托管路径。

`npm run bws:plan` 会根据公开 manifest 输出需要创建的 Bitwarden 项目、machine account、secret key、GitHub Environment Secret 和 GitHub variables，不输出真实 secret value。`npm run bws:next` 会输出当前 Bitwarden 设置状态和下一条安全命令，只报告 project id、`BWS_ACCESS_TOKEN`、`GH_TOKEN` / `GITHUB_TOKEN` 是否存在，不打印任何值；BWS 辅助工具会优先识别 `AI_LINK_BWS_CLI_PATH`，然后识别 PATH 和 Bitwarden Secrets Manager 的 Windows 默认安装路径。`npm run bws:onboard` 会生成一页不含真实密钥的入场引导到 `runtime/tmp/bws-onboarding.md`，把当前状态、目标结构和下一步动作合在一起。`npm run bws:profile` 会生成只包含非敏感 Bitwarden project ID 的本地 PowerShell 片段到 `runtime/tmp/bws-local-profile.ps1`，后续可用 `. .\runtime\tmp\bws-local-profile.ps1` 载入当前会话；它不会保存 `BWS_ACCESS_TOKEN`。`npm run bws:activate` 会分两段隐藏输入本地 Codex machine account token 和 GitHub Actions machine account token，分别验收 `ai-link-local-dev` 与 `ai-link-ci`，并生成 GitHub provider-live variable 填写清单；它不会保存任何 token。`npm run bws:worksheet` 会生成不含真实密钥的本地工作单到 `runtime/tmp/bws-setup-worksheet.md`，方便逐项勾选 Bitwarden / GitHub UI 配置。`npm run bws:rotation` 会生成不含真实 token 的 90 天轮换计划、验收步骤和应急轮换清单。`npm run bws:github-vars` 会从 Bitwarden CI 项目读取 secret ID，生成 GitHub `provider-live` Environment variable 填写清单，不输出 secret value。`npm run bws:github-vars:apply-plan` 会预览 GitHub Environment Variables 自动写入计划；真正写变量时使用 `npm run bws:github-vars:apply`，它只写 Bitwarden secret ID，不处理 `BW_ACCESS_TOKEN` secret value。`npm run bws:acceptance` 会生成不含真实密钥的验收报告到 `runtime/tmp/bws-acceptance-report.md`，把本地 BWS、GitHub wiring、审批门、安全扫描和 Git 状态放在一张表里；`npm run bws:acceptance:json` 会输出同一状态的机器可读版本，供 Codex、CI 或交接脚本判断 pending / pass / warn。`npm run bws:session` 会在缺少 `BWS_ACCESS_TOKEN` 时隐藏输入 token，只在当前子命令里临时使用，并默认执行严格检查。`npm run providers:live:safe-report` 会把真实 provider 验收结果写入 `runtime/tmp/provider-live-report.json`，只保留脱敏摘要；GitHub provider-live workflow 也会把同一文件上传为 `provider-live-summary` artifact。`npm run bws:check` 会串联本地 BWS、GitHub provider-live workflow、公开配置安全扫描和治理文件检查。没有真实 token 时会给出 warning；等 Bitwarden 项目和 machine account token 都配置好后，再用严格模式确认：

```powershell
npm run bws:check:strict
npm run bws:acceptance:strict
npm run providers:live:safe-report:strict
npm run release:readiness
```

运行 AI Link 时再通过 BWS 临时注入环境变量：

```powershell
npm run bws:doctor
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"
npm run bws:run -- -CommandLine "npm run ai-link -- doctor"
npm run bws:run -- -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""测试"""
```

`npm run bws:run` 是 `tools/with-bitwarden-secrets.ps1` 的 npm 入口，用来把任意已审批的 AI Link 命令包进 `bws run`。它要求当前会话已有 `AI_LINK_BWS_PROJECT_ID` 和 `BWS_ACCESS_TOKEN`，不会保存或打印 token；如果需要隐藏输入 token，先用 `npm run bws:session`。

Bitwarden Secret key 必须直接等于环境变量名，例如 `DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`ARK_API_KEY`、`XAI_API_KEY`。Secret value 才是真实值。不要把真实 key 写入公开仓库、issue、PR、知识库或聊天记录。完整流程见 `docs/20-architecture/bitwarden-secret-management.md`。

公开仓中的 `.ai-link/bitwarden-secrets.manifest.json` 只记录预期环境变量名，用来帮助 `tools/check-bitwarden-secrets.ps1` 检查 Bitwarden 项目是否配置完整，不包含任何真实密钥。

## 当前不可假设

- 不要假设所有 provider 的高级能力都已经完整实现。
- 不要假设扣子工作流已具备开箱即用的真实平台能力；当前支持 dry-run 和本机命令适配，真实执行取决于用户 `.ai-link/local.yaml` 或用户全局私有配置。
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
npm run skills:check
npm run package:check
npm run package:install-smoke
npm run next:actions
npm run setup:handoff
npm run maintainer:pack
npm run external:preflight
npm run roadmap:next
npm run bws:next
npm run bws:run:help
npm run github:safety
npm run github:hardening
npm run github:hardening:next
npm run release:plan
npm run release:decisions
npm run release:decisions:next
npm run release:decisions:update
npm run release:manual-gates
npm run release:evidence
npm run release:readiness
npm run ai-link -- config validate
npm run providers:dry
npm run workflow:dry
npm run bws:plan
npm run bws:next
npm run bws:onboard:print
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

配置完 GitHub `provider-live` Environment 后，可以在本机设置 `GH_TOKEN` 或 `GITHUB_TOKEN`，再运行：

```powershell
npm run providers:github:remote-check
```

这个检查只确认远端 environment、变量名和 secret 名称是否齐全，不输出 secret value。

`npm run verify:fresh` 会把当前 Git 提交克隆到临时目录，重新执行安装、检查、测试、包内容检查、临时安装 smoke、GitHub 安全基线、发布计划、配置校验、CLI dry-run 和安全扫描，用来模拟外部用户 fresh clone 后的体验。
