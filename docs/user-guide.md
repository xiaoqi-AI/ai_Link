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
- 项目需求、规划与边界：`docs/10-product/project-requirements-plan-boundary.md`
- 细化项目规划：`docs/10-product/project-plan-detailed.md`
- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 授权中枢后续规划草案：`docs/10-product/auth-hub-next-steps-draft.md`
- 平台授权与采集连接器 P0：`docs/10-product/platform-auth-connectors-p0.md`
- 配置说明：`docs/20-architecture/configuration.md`
- Bitwarden 密钥托管模式：`docs/20-architecture/bitwarden-secret-management.md`
- Provider 说明：`docs/20-architecture/provider-adapters.md`
- Provider 真实调用验收：`docs/20-architecture/provider-live-verification.md`
- 连接器合同：`docs/20-architecture/connector-contracts.md`
- Google Search Console connector：`docs/20-architecture/google-search-console-connector.md`
- Codex Skill 调用约定：`docs/20-architecture/codex-skill-integration.md`
- AI Link Skill 制作模板：`docs/90-templates/ai-link-skill-authoring.md`
- 统一授权中枢说明：`docs/20-architecture/auth-hub.md`
- 授权中枢部署检查：`docs/20-architecture/auth-hub-deployment-checklist.md`
- Auto Ops 示例：`examples/auto-ops/`
- AI Link Skill 作者示例：`examples/codex-skills/ai-link-skill-author/SKILL.md`
- BWS Codex Skill 示例：`examples/codex-skills/bws-secret-mode/SKILL.md`
- 迭代边界与约束：`docs/00-governance/iteration-boundaries.md`
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

Windows PowerShell 如果提示无法加载 `npm.ps1`，把命令里的 `npm` 换成 `npm.cmd` 即可，例如 `npm.cmd run onboard:print` 或 `npm.cmd run bws:next`。

`onboard:print` 会输出一页不含密钥的公开用户入场引导，覆盖当前项目配置、第一条 dry-run 路径、自然语言 skill 草稿预览、BWS 密钥托管入口和收尾检查。需要机器可读状态时，用 `npm run onboard:json` 或 `npm run ai-link -- onboard --json`；需要 CI/其他 agent 用退出码判定时，用 `npm run onboard:check` 或 `npm run ai-link -- onboard --json --strict`；需要保存到本地运行态时，用 `npm run onboard` 写入 `runtime/tmp/ai-link-onboarding.md`；该文件默认不进入 Git。`package:check` 会先重新构建运行时产物，再用 `npm pack --dry-run` 模拟打包并确认包内不含源码测试、运行态、自动化目录或敏感本地文件；机器可读版本用 `package:check:json`，它不会发布到 npm。`package:install-smoke` 会把本地 tarball 安装到临时空项目里，再运行安装后的 `ai-link --version` 和 `config validate`；机器可读版本用 `package:install-smoke:json`，它同样不会发布到 npm。`next:actions` 会输出当前最高优先级的下一步行动图，把本地基线、GitHub 加固、Bitwarden 配置、provider-live Environment、成本审批和 v0.1 发布决策放到一张表里；机器可读版本用 `next:actions:json`，不会读取密钥或修改远端设置。`iteration:boundary` 会输出本轮开发前的边界卡模板、治理检查、验证档位和停止条件，帮助 Codex、目标模型和其他 Agent 在动手前确认需求、预期工作、验证和边界控制；机器可读版本用 `iteration:boundary:json`，不会读取密钥或修改外部系统。`external:preflight` 会在真正进入 Bitwarden 或 GitHub UI 前做一次只读 go/no-go 检查，确认公开仓是否干净、是否同步、来源报告是否可用；机器可读版本用 `external:preflight:json`，不会读取密钥或修改外部系统。`roadmap:next` 会输出公开安全路线图，把 v0.1 本地基线、外部人工门槛、v0.2 真实 provider 验收、skill 创作、agent/connector 扩展和后续 SDK 拆成阶段；机器可读版本用 `roadmap:next:json`。`github:safety` 会检查公开仓本地治理基线；如果本机安装并登录了 `gh`，或当前会话设置了 `GH_TOKEN` / `GITHUB_TOKEN`，还会只读核验远端 branch protection、secret scanning 和 push protection 状态；机器可读版本用 `github:safety:json`，不会修改 GitHub 设置，也不会输出 token。`release:plan` 会检查 `CHANGELOG.md`、GitHub Release 草稿、发布流程文档、tag 计划和 npm 发布决策项；机器可读版本用 `release:plan:json`，不会创建 tag 或发布 npm。`release:decisions:update` 会把人工确认后的 v0.1 决策写入公开安全记录，默认只预览，只有加 `--yes` 才会写入，并且会拒绝疑似密钥内容。`release:manual-gates` 会输出 v0.1 人工门槛计划，把 GitHub 保护、secret scanning / push protection、npm 发布决策和 provider-live 成本审批拆成 owner、动作、完成证据和安全边界；机器可读版本用 `release:manual-gates:json`，不会修改 GitHub、创建 tag、发布 npm 或触发真实 provider。`release:evidence` 会汇总 onboarding、包检查、下一步行动、GitHub 安全、发布计划、人工门槛和发布就绪摘要，并把 JSON 写入 `runtime/tmp/release-evidence.json`；机器可读版本用 `release:evidence:json`，默认不写文件。`release:readiness` 会输出 v0.1 公开发布基线报告，把仓库内已满足项和 GitHub UI / npm 发布决策这类人工确认项分开；机器可读版本用 `release:readiness:json`。`providers:dry:json` 会输出 provider 验收摘要，包含 `summary.ok`、`summary.counts` 和逐个 provider 状态，适合 Codex skill、CI 或其他 agent 判定 dry-run 是否可用。

`release:decisions:next` 会为每个 pending 决策生成公开安全的预览命令和写入命令。维护者应先运行 `release:decisions:next` 复核命令，再用 `release:decisions:update` 预览单条决策，最后确认安全后才加 `--yes`。

如果没有外部模型 API key，可以先使用 `mock`：

```powershell
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```

`skill draft` 会把自然语言说明转换成候选 `routes` 和 `workflows`；加 `--write .ai-link/local.yaml` 时默认只预览，只有再加 `--yes` 才会写入；加 `--diff` 会额外列出本次合并将新增或更新哪些 `routes`、`workflows` 和 `policies`；再加 `--json` 会输出机器可读的 `target`、`previewOnly`、`merged`、`draft` 和 `diff`。`workflow run` 会按配置串联多个阶段。默认 `auto_ops` 示例会依次运行 Grok 调研、Kimi 写稿和 Coze agent workflow dry-run。需要给后续 Codex 步骤稳定交接时，用 `--output runtime/tmp/*.json` 写入结构化结果；需要保留本地运行索引时，可以加 `--record`，记录会写入 `runtime/tmp/ai-link-runs/`，随后用 `runs list` 查看最近记录、用 `runs show <id>` 查看单条记录。多阶段任务可以先用 `--stages research --record` 留下阶段记录，再用 `--resume-from latest` 或 `--resume-from <id>` 续跑剩余阶段；需要从某个阶段重跑时，加 `--from-stage article_draft`。这些运行产物默认不进入 Git；`--record` 不会在 request 里单独保存原始 input，但 provider 输出可能回显任务内容，所以仍只适合留在本地临时目录。制作新 skill 时，先用 `docs/90-templates/ai-link-skill-authoring.md` 明确需求、预期开发工作、验证和边界控制，再参考 `examples/codex-skills/ai-link-skill-author/SKILL.md`；自动运营示例见 `examples/codex-skills/auto-ops-ai-link/SKILL.md`；进入 BWS 密钥托管模式时，示例见 `examples/codex-skills/bws-secret-mode/SKILL.md`。

默认 policy 使用 `allowOutbound: user-approved`，所以真实调用 DeepSeek、Kimi、豆包、Grok、OpenAI-compatible 或 Coze 等外部 provider 前都需要人工批准；dry-run 只显示审批提示。直接 `run` 真实调用前需要加 `--approve-policy`，通过 workflow 真实运行前需要加对应的 `--approve-stage <stage>`，完整工作流可用 `--approve-all`。`auto_ops.agent_flow` 额外标记为 `external_action` policy，只允许 `coze` / `mock` 这类 agent workflow 路径，并在结果 metadata 中保留审计标签和数据分类。policy 还可以配置 `allowedModels`、`blockedModels` 和 `budget`，在密钥可用前先限制可用模型与单次调用预算；`--record` 生成的本地运行记录会额外写入顶层 `audit` 摘要，方便后续复盘或接授权中枢。

## Google Search Console 公开检查与真实只读验收

仓库内可以直接检查公开站点的 HTTP、robots、sitemap、canonical、noindex 和旧 `.html` URL 跳转，不需要 Google OAuth：

```powershell
npm.cmd run gsc:check -- --config examples/google-search-console/voice-site.public.json
```

需要给其他 Agent 或 CI 交接时，可同时保存 JSON 与中文 Markdown：

```powershell
npm.cmd run gsc:check -- `
  --config examples/google-search-console/voice-site.public.json `
  --json `
  --output runtime/tmp/gsc-public-check.json `
  --report-output runtime/tmp/gsc-public-report.md
```

公开默认只使用 Google API mock，不读取 OAuth token，也不会点击 `Request indexing` 或真实提交 sitemap。

完成 Google Cloud Desktop OAuth client 配置并确认只读授权后，可以在本机运行：

```powershell
npm.cmd run gsc:authorize -- `
  --client-config runtime/private/google-search-console/desktop-client.json

npm.cmd run gsc:check -- `
  --config examples/google-search-console/voice-site.domain.public.json `
  --credentials runtime/private/google-search-console/authorized-user.json `
  --history runtime/private/google-search-console/domain-history.json `
  --json `
  --output runtime/tmp/gsc-live-domain-check.json `
  --report-output runtime/tmp/gsc-live-domain-report.md
```

Domain Property 配置支持 `includeSitemapUrls`，会从 sitemap 自动展开同源 URL 做全量只读监控。真实只读检查默认把最多 90 次脱敏快照保存到 `runtime/private/google-search-console/domain-history.json`，后续报告会输出相对上次检查的改善、退化和状态变化；临时运行可加 `--no-history`。授权完成后可先用 `npm.cmd run gsc:schedule:plan` 预览 Windows 每日任务，计划模式不会注册任务，真正应用仍需显式执行带 `-Apply` 的安装命令。

授权命令只申请 `webmasters.readonly`，使用系统浏览器、PKCE、随机 state 和 `127.0.0.1` 一次性回调。首轮验收的 refresh token 只保存在 `runtime/private/`，短期 access token 只驻留当前进程内存；长期自动化应再迁入受控 secret manager。完整 Google Cloud 中文操作、状态口径、Auth Hub `gsc_monitor` 任务格式、历史快照、错误处理、定时运行和 sitemap 写权限门禁见 `docs/20-architecture/google-search-console-connector.md`。

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

控制台首页会展示公开安全的连接器状态；只读 API `GET /api/connectors` 的顶层 `connectors` 是服务端静态能力契约，`executorRuntime` 是本地执行器带过期时间的能力与探测证据。静态契约只能说明代码合同存在，执行器心跳只能说明进程在线且方法已加载；只有显式 `connector_probe` 任务在绑定 executor/session/lease 下成功完成后，对应操作才会进入 `verifiedOperations`。这仍不代表整个平台、写权限或发布能力可用。执行器回传 AI Link `audit` 摘要后，任务详情页、控制台审计页和 `GET /api/audit` 会显示 provider、model、policy、审批、预算和 usage estimate，便于复盘但不暴露原始输入、输出或密钥。本地 run record 也可以用 `npm run ai-link -- runs submit-audit latest --task-id <auth-hub-task-id>` 追加到授权中枢审计日志；需要只看 AI Link 审计时，可打开 `/dashboard/audit?eventType=ai_link.audit` 或调用 `GET /api/audit?eventType=ai_link.audit`。要验证整条本地交接链路，可直接运行 `npm run auth-hub:audit-smoke`，它会用 dry-run workflow 生成本地记录并回传审计。

如果要从项目负责人视角判断“现在是否需要人工续登或配置授权”，打开 `/dashboard` 或 `/dashboard/connectors` 的“授权/登录关注项”。其他项目可用只读 API `GET /api/auth-status` 读取同一份摘要：它只返回平台、状态、公开错误码、处理建议、行动负责人、处理说明和关联任务 ID，不返回 Cookie、Profile、token、账号详情或原始平台响应。ParentingGame、Hermes Agent 等项目应把这个接口当作“是否需要暂停自动化并提醒维护者”的信号，而不是直接读取真实登录态。`unverified` 表示缺少新鲜执行器心跳或真实只读探测证据，此时不能继续需要真实平台的自动化；`authStatus.nextActions` 则列出已经明确需要人处理的事项。

跨项目只读消费可以直接运行：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前由负责人确认
$env:AI_LINK_CODEX_TOKEN="<read-only-codex-token>"
npm run auth-hub:status
npm run auth-hub:status:json
npm run auth-hub:status:strict -- --platform github
```

如果远程 Auth Hub 放在 Cloudflare Access 后面，并且使用 Service Auth 给本地执行器或其他项目做只读检查，可以只在当前终端临时注入 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`。`auth-hub:status` 只调用 `GET /api/auth-status`，不会输出 token、Cookie、Profile、二维码、截图、账号详情、原始响应、内部 lease/session/revision 或 `runtime/private` 路径。外部项目需要真实平台能力时应使用 `npm run auth-hub:status:strict -- --platform <platform>`：只有目标平台为 `ready` 才继续；`unverified`、`needs_action`、`reserved`、`blocked`、过期 probe 或缺失平台都会非零退出。不要无差别检查所有平台；普通代码、文档、UI 和本地测试无需调用该状态接口。

`platform_auth_collect` 用于统一处理小红书会话/只读搜索、公众号官方 API 健康检查和 GitHub 授权健康检查。公开仓只提供安全脚手架，不携带真实登录态；维护者只能把已审查的模块放入 `runtime/private/`。单平台排障时可以让 `AI_LINK_PRIVATE_CONNECTOR_MODULE` 直接指向一个适配器；三平台同时启用时，应先生成 `runtime/private/platform-connectors.mjs` 组合入口，再让该变量只指向组合入口。不要把模块路径放进任务输入，也不要把 Cookie、Profile、二维码、公众号凭据、GitHub token 或原始响应发到远端 Auth Hub。具体合同、允许的操作和错误代码见 `docs/20-architecture/connector-contracts.md`。

小红书 P0.2 先生成私有命令适配器：

```powershell
npm run auth-hub:xhs-adapter:print
npm run auth-hub:xhs-adapter:new
$env:AI_LINK_XHS_READONLY_BRIDGE="runtime/private/xiaohongshu-readonly-bridge.mjs"
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/xiaohongshu-readonly-adapter.mjs"
npm run auth-hub:executor:start
```

真实桥必须由维护者单独审查并放在 `runtime/private/`，适配器不会生成或保存账号登录态。它以 Node 子进程运行桥，不使用 shell；标准输入是带 `schema_version`、`platform`、`operation` 和受限 `input` 的 JSON，标准输出必须是一个 JSON 对象。允许的操作只有 `check_session`、`begin_login` 和 `search_content`。`begin_login` 首次只返回 Auth Hub 人工审批，批准并推进到 `platform_interactive_login` 后才调用私有桥；浏览器必须可见，扫码、验证码和续登由账号负责人完成。

只读搜索最多返回 4 条具体笔记。适配器会删除 `xsec_token`、查询参数、fragment、账号字段和原始响应，只重建 `https://www.xiaohongshu.com/explore/{note_id}`、有限标题/摘要及 `source_reachability=verified`。发布、点赞、评论、关注、私信、绕验证码和无人值守登录均不在范围内。

小红书会话检查任务示例：

```json
{
  "workflow": "platform_auth_collect",
  "input": {
    "platform": "xiaohongshu",
    "operation": "check_session"
  }
}
```

确认会话有效后，只读搜索使用 `operation=search_content`，并传入 `query` 与 `limit`（1 至 4）。需要登录时再创建 `operation=begin_login`，不要在定时任务里自动批准交互登录。

普通 `platform_auth_collect` 结果只更新任务，不会自动成为状态证据。只有负责人已经批准一次真实低频健康检查时，才为三项 allowlist 操作增加：

```json
"options": {
  "evidenceIntent": "connector_probe"
}
```

首批只允许 `xiaohongshu/check_session`、`wechat_official/check_health`、`github/check_auth`；`begin_login` 和 `search_content` 不能生成 probe。创建 probe 还要求管理 token 的 `tasks:approve` 权限，默认受限 Codex token 不能自行触发真实探测。Hub 只保存服务端时间与公开结论，默认 15 分钟过期，重复结果不能延长有效期。

GitHub P0.2 的最小任务输入示例：

```json
{
  "workflow": "platform_auth_collect",
  "input": {
    "platform": "github",
    "operation": "check_auth",
    "owner": "xiaoqi-AI",
    "repo": "ai_Link",
    "scope": "repo_read"
  }
}
```

`owner` 与 `repo` 都是必填项；`scope` 只允许 `repo_read`、`actions_read` 或 `pull_request_read`。三者分别调用 `GET /repos/{owner}/{repo}/branches?per_page=1`、`GET /repos/{owner}/{repo}/actions/runs?per_page=1` 和 `GET /repos/{owner}/{repo}/pulls?state=all&per_page=1`，对应 fine-grained token 的 Contents、Actions 和 Pull requests 只读权限。列表为空仍表示端点可读，不会被误判为失败。

官方权限说明：[List branches](https://docs.github.com/en/rest/branches/branches#list-branches)、[List workflow runs for a repository](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository)、[List pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)。

该检查只回答“指定目标与 GitHub 只读授权是否可用/是否需要密钥负责人处理”，不自动修改 GitHub 设置、不合并 PR、不触发 provider-live workflow。GitHub 的公开资源端点可能无需认证即可读取，因此正式 scope 验收应选择经审查的非关键私有仓，并逐个 scope 验证；公开仓结果只能作为连通性证据，不能单独证明 fine-grained token 权限完整。

维护者可以生成本机私有 GitHub 授权健康检查适配器：

```powershell
npm run auth-hub:github-adapter:print
npm run auth-hub:github-adapter:new
$env:GH_TOKEN="<fine-grained-readonly-token-or-session-token>"
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/github-auth-adapter.mjs"
npm run auth-hub:executor:start
```

生成文件位于 `runtime/private/github-auth-adapter.mjs`，不会进入 Git。适配器只执行上述三个 GET 探针；限流优先映射为可重试状态，401/403/404 映射为凭据或目标访问问题，5xx 与网络异常映射为平台不可用。它不会读取响应正文、合并 PR、修改仓库设置、写 GitHub Secrets、触发 Actions 或 provider-live。

公众号 P0.3 可以先生成只读健康检查适配器，不需要把真实凭据写进仓库：

```powershell
npm run auth-hub:wechat-adapter:print
npm run auth-hub:wechat-adapter:new
$env:WECHAT_OFFICIAL_APP_ID="<official-account-app-id>"
$env:WECHAT_OFFICIAL_APP_SECRET="<official-account-app-secret>"
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/wechat-official-health-adapter.mjs"
npm run auth-hub:executor:start
```

生成文件位于 `runtime/private/wechat-official-health-adapter.mjs`，不会进入 Git。它只检查微信官方 API 是否可用，并把缺凭据、凭据无效、出口 IP 未加白名单、限流和官方服务不可用变成 Auth Hub 的公开行动项。成功响应中的 access token 会被立即丢弃。当前只有 `check_health` 是真实私有能力，内容读取、草稿、发布和指标仍为 mock；首次真实健康检查、IP 白名单配置和任何草稿写入都需要单独人工确认。

三套适配器都生成并审查后，用组合生成器建立唯一执行器入口：

```powershell
npm run auth-hub:private-bundle:print
npm run auth-hub:private-bundle:new
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/platform-connectors.mjs"
npm run auth-hub:executor:start
```

默认组合 `github-auth-adapter.mjs`、`wechat-official-health-adapter.mjs` 和 `xiaohongshu-readonly-adapter.mjs`。也可以重复传入 `--module <runtime/private 下的文件>` 定制模块集合。生成器不会导入模块或读取凭据；它拒绝越界、缺失、重复文件和输出自身。组合入口在运行时拒绝缺少工厂、非法导出和两个模块同时拥有同一平台，任一模块失败都会让整体加载失败，避免后加载模块静默覆盖已审查能力。任一子模块更新后，重新运行 `auth-hub:private-bundle:new -- --force` 并重启本地执行器，以刷新模块版本。

执行器启动后会在每轮领取任务前发送能力心跳。Auth Hub 只保存每个执行器的最新白名单快照，并由服务端写入 `lastSeenAt` 与 `expiresAt`；默认 60 秒过期，可用 `AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS` 在 15 秒至 10 分钟内调整。心跳失败不会阻塞任务领取，旧版 Hub 也能继续工作；但状态中心会把缺失或过期证据标成 `unverified`。心跳不执行 `check_session`、`check_health`、`check_auth` 或任何平台方法，因此 `canRunReal=false` 是预期结果。

远程 Auth Hub 必须使用独立域名；当前 `voice.xiao-qi-ai.com` 承载的不是 Auth Hub，不应覆盖。建议候选是 `auth.xiao-qi-ai.com`，最终地址、授权邮箱范围和 Cloudflare Access 配置需要负责人确认。部署后可先用 `npm run auth-hub:remote:next` 判断域名、部署蓝图和当前终端环境是否已准备好，再用 `npm run auth-hub:remote:smoke` 做 mock 空跑验收。smoke 脚本会显式清除 `AI_LINK_PRIVATE_CONNECTOR_MODULE`，只加载公开 mock 连接器，并验证执行器在线心跳、任务闭环、审批、权限边界和脱敏审计；它不会探测真实账号。生产 token、Cloudflare Access Service Auth 凭据和应用密码只允许临时放在当前终端环境变量或 secret manager 中，不要写入仓库、知识库或聊天记录。

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

`npm run bws:plan` 会根据公开 manifest 输出需要创建的 Bitwarden 项目、machine account、secret key、GitHub Environment Secret 和 GitHub variables，不输出真实 secret value。`npm run bws:next` 会输出当前 Bitwarden 设置状态和 `recommendedNext` 下一步动作，只报告 project id、`BWS_ACCESS_TOKEN`、`GH_TOKEN` / `GITHUB_TOKEN` 是否存在，不打印任何值；BWS 辅助工具会优先识别 `AI_LINK_BWS_CLI_PATH`，然后识别 PATH 和 Bitwarden Secrets Manager 的 Windows 默认安装路径。`npm run bws:onboard` 会生成一页不含真实密钥的入场引导到 `runtime/tmp/bws-onboarding.md`，把当前状态、目标结构和下一步动作合在一起。`npm run bws:profile` 会生成只包含非敏感 Bitwarden project ID 的本地 PowerShell 片段到 `runtime/tmp/bws-local-profile.ps1`，后续可用 `. .\runtime\tmp\bws-local-profile.ps1` 载入当前会话；它不会保存 `BWS_ACCESS_TOKEN`。`npm run bws:activate` 会分两段隐藏输入本地 Codex machine account token 和 GitHub Actions machine account token，分别验收 `ai-link-local-dev` 与 `ai-link-ci`，并生成 GitHub provider-live variable 填写清单；它不会保存任何 token。`npm run bws:worksheet` 会生成不含真实密钥的本地工作单到 `runtime/tmp/bws-setup-worksheet.md`，方便逐项勾选 Bitwarden / GitHub UI 配置。`npm run bws:rotation` 会生成不含真实 token 的 90 天轮换计划、验收步骤和应急轮换清单。`npm run bws:github-vars` 会从 Bitwarden CI 项目读取 secret ID，生成 GitHub `provider-live` Environment variable 填写清单，不输出 secret value。`npm run bws:github-vars:apply-plan` 会预览 GitHub Environment Variables 自动写入计划；真正写变量时使用 `npm run bws:github-vars:apply`，它只写 Bitwarden secret ID，不处理 `BW_ACCESS_TOKEN` secret value。`npm run bws:acceptance` 会生成不含真实密钥的验收报告到 `runtime/tmp/bws-acceptance-report.md`，把本地 BWS、GitHub wiring、审批门、安全扫描和 Git 状态放在一张表里；`npm run bws:acceptance:json` 会输出同一状态的机器可读版本，供 Codex、CI 或交接脚本判断 pending / pass / warn。`npm run bws:session` 会在缺少 `BWS_ACCESS_TOKEN` 时隐藏输入 token，只在当前子命令里临时使用，并默认执行严格检查。`npm run providers:live:safe-report` 会把真实 provider 验收结果写入 `runtime/tmp/provider-live-report.json`，只保留脱敏摘要；GitHub provider-live workflow 也会把同一文件上传为 `provider-live-summary` artifact。`npm run bws:check` 会串联本地 BWS、GitHub provider-live workflow、公开配置安全扫描和治理文件检查。没有真实 token 时会给出 warning；等 Bitwarden 项目和 machine account token 都配置好后，再用严格模式确认：

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
- 不要假设统一授权中枢已经自带真实微信、朱雀AI、抖音、小红书、知乎或头条账号自动化；公开 MVP 只提供 mock、合同和私有注入边界，真实实现及登录态仍由本机私有模块承担。
- 不要把发布、真实 provider 调用、真实平台登录或正式内容发布当作自动步骤；这些都属于人工确认边界，详见 `docs/00-governance/iteration-boundaries.md`。
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
npm run iteration:boundary
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
