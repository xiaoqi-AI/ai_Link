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
$env:BWS_ACCESS_TOKEN="<machine-account-access-token>"
```

检查 provider 状态：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-bitwarden-secrets.ps1
```

检查脚本会读取 `.ai-link/bitwarden-secrets.manifest.json`，在 `BWS_ACCESS_TOKEN` 和 `AI_LINK_BWS_PROJECT_ID` 存在时验证预期 secret key 是否都已创建。它不会打印 secret value。

检查 AI Link provider 状态：

```powershell
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"
```

运行 dry-run：

```powershell
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""测试"""
```

直接使用 `bws` 也可以：

```powershell
bws run --project-id <ai-link-local-dev-project-id> -- npm run ai-link -- doctor
bws run --project-id <ai-link-local-dev-project-id> -- npm run ai-link -- run auto_ops.research --provider grok --input "..."
```

真实外部模型调用可能产生费用；默认先用 `doctor` 和 `--dry-run` 验证。

如果 `bws` 刚安装后当前 Codex 终端还识别不到 PATH，`tools/with-bitwarden-secrets.ps1` 和 `tools/check-bitwarden-secrets.ps1` 会自动尝试读取默认安装位置：

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
            <xai-secret-id> > XAI_API_KEY
      - run: npm run ai-link -- doctor
```

## 收尾检查

每次进入 BWS 密钥托管模式后，收尾至少检查：

```powershell
git status --short
powershell -ExecutionPolicy Bypass -File tools/check-bitwarden-secrets.ps1
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
