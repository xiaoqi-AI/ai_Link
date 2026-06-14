# AI Link 配置说明

## 配置优先级

AI Link 按以下顺序合并配置，越靠前优先级越高：

```text
会话临时指定 > 项目 local 私有配置 > 项目公开配置 > 用户全局配置 > 默认配置
```

当前 CLI 中对应为：

- 会话临时指定：`--provider`、`--model`、`--dry-run`、`--allow-sensitive` 等命令参数。
- 项目 local 私有配置：`.ai-link/local.yaml`，不进入 Git。
- 项目公开配置：`.ai-link/project.yaml`，可进入公开仓，只放非敏感默认路由。
- 用户全局配置：`%USERPROFILE%\.ai-link\config.yaml`，用于本机多项目共享。
- 默认配置：`src/config/defaults.ts` 中的保守默认值。

## 公开配置

公开配置可以包含 provider 名称、默认模型、能力标签和任务路由，但不能包含真实 API key、私有 endpoint、账号信息或内部策略。

示例：

```yaml
routes:
  auto_ops.research:
    provider: grok
    fallback:
      - deepseek
      - kimi
      - mock

providers:
  grok:
    type: grok
    baseUrl: https://api.x.ai/v1
    apiKeyEnv: XAI_API_KEY
    model: grok-4.3
```

## 工作流配置

`routes` 描述单个任务应该交给哪个 provider，`workflows` 描述一个 skill 或业务流程由哪些任务阶段串起来。

```yaml
workflows:
  auto_ops:
    description: Research with Grok, then draft with Kimi while Codex keeps execution control.
    stages:
      - name: research
        task: auto_ops.research
        inputFrom: original
      - name: article_draft
        task: auto_ops.article_draft
        inputFrom: original-and-previous
```

`inputFrom` 支持：

- `original`：只使用用户原始输入。
- `previous`：只使用前序阶段输出。
- `original-and-previous`：把用户原始输入和前序阶段输出一起交给当前阶段。

运行示例：

```powershell
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿"
npm run ai-link -- workflow run auto_ops --stages research,article_draft --dry-run --input "调研一个公开选题并写初稿"
```

## 本机私有配置

本机私有配置用于覆盖公开配置，适合放本机专属模型、endpoint 或策略。这个文件默认被 `.gitignore` 忽略。

```yaml
providers:
  kimi:
    model: kimi-k2.6
    apiKeyEnv: MOONSHOT_API_KEY

routes:
  auto_ops.article_draft:
    provider: kimi
```

Agent provider 的本机命令也应放在 local 配置中。以 Coze 为例：

```yaml
providers:
  coze:
    type: coze
    model: coze-agent-workflow
    command: coze
    args:
      - session
      - message
      - --wait
      - --format
      - json

routes:
  auto_ops.agent_flow:
    provider: coze
    fallback:
      - mock
```

AI Link 会把任务信息作为 stdin JSON 传给本机命令。命令可以返回纯文本，也可以返回 `{ "output": "..." }` JSON。公开配置不要写 Coze 登录态、token、私有 workspace ID 或本机路径。

## 密钥管理

默认推荐进入 BWS 密钥托管模式：个人密码、网站链接和恢复码放 Bitwarden Password Manager，API key、token 和自动化凭据放 Bitwarden Secrets Manager。Codex 或 AI Link 运行时通过 `bws run` 临时注入环境变量，不把真实密钥写入仓库、知识库、issue、PR 或聊天记录。

```powershell
$env:AI_LINK_BWS_PROJECT_ID="<ai-link-local-dev-project-id>"
$env:BWS_ACCESS_TOKEN="<machine-account-access-token>"
powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"
```

`BWS_ACCESS_TOKEN` 是当前会话的 bootstrap secret，只能放在本机会话环境中，不写入项目目录。`AI_LINK_BWS_PROJECT_ID` 不是密钥，可以作为本机环境变量保存。

Secret key 必须直接等于环境变量名，例如 `DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`XAI_API_KEY`、`AI_LINK_EXECUTOR_TOKEN`。Secret value 才是真实值。

也可以在用户全局配置或项目 local 配置中指定 `apiKeyEnv`。公开仓中的示例只应出现环境变量名，不应出现真实值。完整约定见 `docs/20-architecture/bitwarden-secret-management.md`。

## 策略

默认策略会扫描出站文本中的常见密钥形态，例如私钥、`sk-...`、Bearer token、`*_API_KEY=...` 等。如果确实需要发送敏感材料，必须由用户在当前命令中显式使用 `--allow-sensitive`，并自行承担数据出站风险。

## 配置校验

可以用 CLI 校验当前合并后的配置：

```powershell
npm run ai-link -- config validate
```

公开配置安全门禁由 `npm run security:scan` 执行，会专门检查 `.ai-link/project.yaml` 和 `examples/**/project.yaml`。公开配置中禁止出现 `apiKey`、`token`、`secret`、`password`、`command`、`args`、`authorization`、`cookie`、`runtime/private/`、`.env` 或本机用户路径。`apiKeyEnv` 这类环境变量名仍然允许。

校验会覆盖：

- 默认 provider / policy 是否存在。
- route 的主 provider 和 fallback provider 是否已配置。
- workflow stage 指向的 route 和 provider 是否已配置。
- provider type 是否受支持。
- 模型 provider 是否配置了 `baseUrl` 或 `endpoint`。
- 自定义策略正则是否有效。
- 公开配置中是否疑似内联了 `apiKey`。

校验命令遇到错误会返回非零退出码，适合放入 CI。内联 `apiKey` 当前作为 warning 输出，目的是提醒用户只允许在本机私有配置中使用。

## 常用命令

```powershell
npm install
npm run ai-link -- doctor
npm run ai-link -- config validate
npm run ai-link -- providers list
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿"
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿" --output runtime/tmp/auto-ops-workflow.json
npm run ai-link -- run auto_ops.research --dry-run --input "调研一个公开选题"
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```
