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

## 密钥管理

第一版默认推荐使用环境变量：

```powershell
$env:DEEPSEEK_API_KEY="..."
$env:MOONSHOT_API_KEY="..."
$env:XAI_API_KEY="..."
```

也可以在用户全局配置或项目 local 配置中指定 `apiKeyEnv`。公开仓中的示例只应出现环境变量名，不应出现真实值。

## 策略

默认策略会扫描出站文本中的常见密钥形态，例如私钥、`sk-...`、Bearer token、`*_API_KEY=...` 等。如果确实需要发送敏感材料，必须由用户在当前命令中显式使用 `--allow-sensitive`，并自行承担数据出站风险。

## 常用命令

```powershell
npm install
npm run ai-link -- doctor
npm run ai-link -- providers list
npm run ai-link -- run auto_ops.research --dry-run --input "调研一个公开选题"
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```
