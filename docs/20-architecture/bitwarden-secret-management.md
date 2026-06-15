# Bitwarden 密钥托管模式

## 目标模式

AI Link 默认采用 Bitwarden Free + Bitwarden Secrets Manager Free 的双库模型：

- Bitwarden Password Manager Free 管理个人密码、网站链接、恢复码、安全笔记和 API 平台账号。
- Bitwarden Secrets Manager Free 管理 API key、token 和自动化凭据。
- Codex、AI Link CLI、本地执行器和 GitHub Actions 只通过临时环境变量读取密钥。
- 公开仓、知识库、issue、PR 和聊天记录只允许出现环境变量名，不允许出现真实密钥值。

目标模式口令：

```text
进入 BWS 密钥托管模式：个人密码、网站链接、恢复码和账号资料放 Bitwarden Password Manager；API key、token、自动化凭据放 Bitwarden Secrets Manager；公开仓、知识库、issue、PR 和聊天里只允许出现环境变量名，不允许出现真实密钥值。Codex 或 AI Link 需要调用密钥时，只能通过 bws run 临时注入环境变量，并在收尾时检查 Git 状态和敏感信息边界。
```

短口令：

```text
进入 BWS 密钥托管模式
```

Codex 可复用的项目内 skill 示例位于 `examples/codex-skills/bws-secret-mode/SKILL.md`。当用户说出短口令或完整口令时，Codex 应按该 skill 的入口检查、密钥边界、本地 BWS 流程、GitHub provider-live 流程和收尾检查执行。

## Bitwarden 结构

Password Manager 建议建立以下文件夹：

- `AI Accounts`
- `API Portals`
- `Private Links`
- `Recovery Codes`

Secrets Manager 建议使用：

- 组织：`ai-link-lab`
- 项目：`ai-link-local-dev`，用于本地 Codex / AI Link 调用。
- 项目：`ai-link-ci`，用于 GitHub Actions 自动化。
- 第三个免费项目暂时保留，不预占。

Machine accounts 建议使用：

- `ma-ai-link-local-codex`：只读访问 `ai-link-local-dev`。
- `ma-ai-link-github-actions`：只读访问 `ai-link-ci`。

Access token 默认设置 90 天过期，到期前轮换。除非正在执行轮换，不要给本地 Codex token 写权限。

## Secret 命名

Secret key 必须直接等于 AI Link 读取的环境变量名。Secret value 才是真实值。

当前公开清单保存在 `.ai-link/bitwarden-secrets.manifest.json`，只记录环境变量名和项目结构，不记录真实值。`localDev.expectedSecretKeys` 建议保留这些 key：

```text
OPENAI_COMPATIBLE_API_KEY
DEEPSEEK_API_KEY
MOONSHOT_API_KEY
ARK_API_KEY
XAI_API_KEY
AI_LINK_APP_PASSWORD
AI_LINK_SESSION_SECRET
AI_LINK_ADMIN_TOKEN
AI_LINK_EXECUTOR_TOKEN
AI_LINK_CODEX_TOKEN
DATABASE_URL
SMTP_URL
```

不要使用中文、空格、短横线或平台昵称作为 Secret key。需要说明用途时写在 Bitwarden 的 note 中。

## 本地 Codex / AI Link 调用

本地只需要在当前会话里提供 `BWS_ACCESS_TOKEN`。它是 bootstrap secret，不写入项目目录、不提交 Git、不同步知识库。

推荐设置一个非敏感项目 ID，方便调用包装脚本：

```powershell
$env:AI_LINK_BWS_PROJECT_ID="<ai-link-local-dev-project-id>"
```

如果不想把 token 明文写进命令历史，可以使用临时会话入口。它会在缺少 `BWS_ACCESS_TOKEN` 时隐藏输入 token，只在当前子命令里设置，结束后恢复环境：

```powershell
npm run bws:session
```

检查 provider 状态：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-bitwarden-secrets.ps1
```

检查脚本会读取 `.ai-link/bitwarden-secrets.manifest.json`，在 `BWS_ACCESS_TOKEN` 和 `AI_LINK_BWS_PROJECT_ID` 存在时验证预期 secret key 是否都已创建。它不会打印 secret value。

也可以使用总检查入口：

```powershell
npm run bws:plan
npm run bws:onboard
npm run bws:profile
npm run bws:activate
npm run bws:check
npm run bws:session:help
npm run bws:run:help
npm run bws:worksheet
npm run bws:rotation:print
npm run bws:github-vars:help
npm run bws:github-vars:apply-plan
npm run bws:acceptance:print
npm run bws:acceptance:json
npm run providers:github:dispatch-plan
npm run bws:check:strict
```

`bws:plan` 会根据 `.ai-link/bitwarden-secrets.manifest.json` 输出安全设置清单，包括 Bitwarden 项目、machine account、secret key、GitHub Environment Secret 和 GitHub variables。它只输出名称和占位符，不输出真实值。`bws:onboard` 会生成 `runtime/tmp/bws-onboarding.md`，把当前本机状态、目标结构和推荐下一步汇总成一页入场引导。`bws:profile` 会生成 `runtime/tmp/bws-local-profile.ps1`，只保存非敏感 Bitwarden project ID，便于用 `. .\runtime\tmp\bws-local-profile.ps1` 载入当前会话；如果当前会话已有 `BWS_ACCESS_TOKEN`，也可以用 `npm run bws:profile:from-bws` 按 manifest 项目名自动读取 project ID。`bws:activate` 是配置完成后的两段式激活向导：先用 `ma-ai-link-local-codex` token 验收 `ai-link-local-dev`，再用 `ma-ai-link-github-actions` token 读取 `ai-link-ci` secret ID 并生成 GitHub variables 清单；两个 token 都只在子命令环境里临时使用。`bws:worksheet` 会生成 `runtime/tmp/bws-setup-worksheet.md`，用于本地勾选 Bitwarden / GitHub 实配进度，不应填写真实 secret value。`bws:rotation` 会生成 `runtime/tmp/bws-rotation-plan.md`，记录 90 天机器账号 token 轮换节奏、验证命令和应急轮换步骤，不接收也不输出真实 token。`bws:github-vars` 会在 Bitwarden CI 项目配置完成后读取 secret ID，生成 GitHub `provider-live` variables 填写清单到 `runtime/tmp/bws-github-provider-live-vars.md`，不输出 secret value。`bws:github-vars:apply-plan` 会预览自动写入 GitHub Environment Variables 的计划；`bws:github-vars:apply` 只写 `BWS_*_SECRET_ID` 这类变量，`BW_ACCESS_TOKEN` 仍必须作为 GitHub Environment Secret 单独安全设置。`bws:acceptance` 会生成 `runtime/tmp/bws-acceptance-report.md`，把 BWS 本地 readiness、GitHub provider-live wiring、外部动作审批门、安全扫描和 Git 状态汇总成不含真实密钥的验收报告；`bws:acceptance:json` 输出同一验收状态的机器可读版本。`bws:check` 会串联本地 BWS、GitHub provider-live workflow、公开配置安全扫描和治理文件检查。没有真实 token 或项目 ID 时会输出 warning；`bws:session` 默认执行严格检查，并隐藏输入缺失的 token；`bws:check:strict` 和 `bws:acceptance:strict` 用于配置完成后的正式验收。

检查 AI Link provider 状态：

```powershell
npm run bws:doctor
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"
npm run bws:run -- -CommandLine "npm run ai-link -- doctor"
```

运行 dry-run：

```powershell
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""测试"""
npm run bws:run -- -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""测试"""
```

直接使用 `bws` 也可以：

```powershell
bws run --project-id <ai-link-local-dev-project-id> -- npm run ai-link -- doctor
bws run --project-id <ai-link-local-dev-project-id> -- npm run ai-link -- run auto_ops.research --provider grok --input "..."
```

真实外部模型调用可能产生费用；默认先用 `doctor` 和 `--dry-run` 验证。

如果 `bws` 刚安装后当前 Codex 终端还识别不到 PATH，可以先在当前会话指定 CLI 路径：

```powershell
$env:AI_LINK_BWS_CLI_PATH="$env:LOCALAPPDATA\Programs\BitwardenSecretsManager\bin\bws.exe"
```

BWS 辅助工具会优先识别 `AI_LINK_BWS_CLI_PATH`，然后识别 PATH 和默认安装位置：

```text
%LOCALAPPDATA%\Programs\BitwardenSecretsManager\bin\bws.exe
```

## GitHub Actions

GitHub Actions 只保存 Bitwarden machine account 的 `BW_ACCESS_TOKEN`，优先放在 GitHub Environment Secret 中。真实 API key 仍留在 Bitwarden Secrets Manager。

Workflow 中使用 `bitwarden/sm-action@v2` 拉取具体 secret，并以 masked environment variable 使用。workflow 文件只能保存 Bitwarden secret ID 和目标环境变量名，不写真实值。

公开清单中的 `githubEnvironments.providerLive` 记录了 GitHub Environment 名称、bootstrap secret 名称和 secret ID variable 映射。可用以下命令检查 workflow 是否仍遵守 BWS 模式：

```powershell
npm run providers:github:check
```

示例模板：

```yaml
name: AI Link secret-backed check

on:
  workflow_dispatch:

jobs:
  doctor:
    runs-on: ubuntu-latest
    environment: ci
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Get Bitwarden secrets
        uses: bitwarden/sm-action@v2
        with:
          access_token: ${{ secrets.BW_ACCESS_TOKEN }}
          secrets: |
            <deepseek-secret-id> > DEEPSEEK_API_KEY
            <ark-secret-id> > ARK_API_KEY
            <xai-secret-id> > XAI_API_KEY
      - run: npm run ai-link -- doctor
```

## 收尾检查

每次进入 BWS 密钥托管模式后，收尾至少检查：

```powershell
git status --short
npm run bws:plan
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
npm run providers:github:dispatch-plan
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

如果发现 `.env`、token、真实 key、二维码、登录态、未脱敏截图或 `runtime/private/` 进入 Git 候选区，立即停止提交并先清理范围。

## 官方参考

- Bitwarden Secrets Manager CLI: <https://bitwarden.com/help/secrets-manager-cli/>
- Bitwarden Secrets Manager Quick Start: <https://bitwarden.com/help/secrets-manager-quick-start/>
- Bitwarden GitHub Actions integration: <https://bitwarden.com/help/github-actions-integration/>
- GitHub Actions secrets: <https://docs.github.com/actions/security-guides/using-secrets-in-github-actions>
