# AI Link Skill 制作边界卡

用途：当用户想新增一个 Codex skill，并希望用自然语言指定“哪个阶段用哪个模型、Agent 或工作流”时，先用这张卡收敛需求，再让 AI Link 生成 route / workflow / policy 草案。

这张卡适合公开仓、Codex 会话和其他维护者复用。它不承诺真实 provider 调用，也不要求用户提前配置密钥。

## 需求

用户目标：

- 这个 skill 要帮助用户完成什么任务。
- 最终由 Codex 交付什么：文档、代码、报告、图片、工作流结果、验证记录或 Git 收尾。

自然语言意图：

```text
调研阶段用 Grok，
文章初稿用 Kimi，
Agent 工作流用 Coze dry-run，
Codex 负责落地、验证和提交。
```

成功标准：

- AI Link 可以从自然语言说明生成可预览的 route / workflow / policy 草案。
- 用户或 Codex 能看懂每个阶段由谁负责、输入来自哪里、输出交给谁。
- 默认只进行 dry-run 或写入 `.ai-link/local.yaml` 预览，不触发真实外部调用。

非目标：

- 不在第一轮创建 SDK、真实 connector、生产授权系统或完整网页管理台。
- 不把真实 key、token、登录态、二维码、截图、原始 provider 响应或私有平台内容写进 skill、公开配置、知识库或聊天记录。
- 不让外部模型直接执行本机命令、修改文件、提交 Git 或发布内容。

## 阶段设计

| 阶段 | 默认负责人 | 适合用途 | 输出交给谁 | 默认边界 |
| --- | --- | --- | --- | --- |
| research | Grok / DeepSeek / mock | 公开资料调研、方向收集 | Codex 或下一阶段 | dry-run 优先，真实调用需审批 |
| article_draft | Kimi / DeepSeek / mock | 长文本草稿、结构化写作 | Codex | dry-run 优先，真实调用需审批 |
| agent_flow | Coze / mock | Agent workflow、外部工具候选 | Codex 审核 | `external_action` policy，真实执行需审批 |
| implementation | Codex | 文件编辑、验证、Git 收尾 | 用户 | 不通过外部模型直接执行 |

如果某个阶段不能说明输入、输出和验收方式，先把它记录为候选，不进入本轮 workflow。

## 预期开发工作

允许改动：

- `examples/codex-skills/<skill-name>/SKILL.md`
- `examples/<example-name>/README.md`
- `docs/20-architecture/codex-skill-integration.md`
- `.ai-link/local.yaml` 预览或用户私有配置

谨慎改动：

- `.ai-link/project.yaml`，只有维护者明确要把 route / workflow 变成公开默认能力时才改。
- `src/skills/` 或 `src/workflows/`，只有现有 `skill draft` 无法表达需求时才改。

明确不碰：

- `.env`
- `runtime/private/`
- 真实 provider key、Bitwarden token、GitHub secret value
- 登录态、二维码、截图、平台后台内容

推荐生成命令：

```powershell
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>"
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/local.yaml --diff --json
```

只有确认后才写入本机 local 配置：

```powershell
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/local.yaml --diff --json --yes
```

写公开项目配置必须额外确认：

```powershell
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/project.yaml --allow-public-config --diff --json --yes
```

## 验证

最小验证：

```powershell
npm run skills:check
npm run ai-link -- skill draft --skill <skill-name> --description "<natural-language intent>" --write .ai-link/local.yaml --diff --json
npm run ai-link -- workflow run <workflow-name> --dry-run --input "<public task brief>"
```

影响公开文档或示例时：

```powershell
npm run check
npm run security:scan
npm run iteration:boundary:json
```

发布或外部集成前：

```powershell
npm run external:preflight:json
npm run release:readiness:json
```

验收证据只记录命令状态、配置差异摘要和公开安全文件路径，不记录真实输入、密钥、原始 provider 响应或平台截图。

## 边界控制

默认继续条件：

- route / workflow / policy 草案能覆盖用户目标。
- 预览 diff 只改预期的 local 或示例文件。
- dry-run 能证明阶段串联关系。
- Codex 仍负责本地执行、验证和 Git。

默认停止条件：

- 用户目标、成功标准或非目标不清。
- 一个 skill 开始需要新增多个 provider、connector、后台服务或真实平台账号。
- 外部模型建议引入 SDK、长期中台、自动发布或生产授权系统。
- 需要真实费用、账号权限、验证码、发布动作或敏感数据。
- 连续验证失败，且失败原因不是局部文档或配置问题。

偏差处理：

- 先暂停扩张，说明偏差。
- 判断是需求不清、外部前提缺失、工具能力不足、范围膨胀还是成本超界。
- 给出缩小范围、拆下一轮、转私有边界、等待人工确认或放弃本轮的选项。
- 涉及真实外部调用、发布、费用或敏感数据时，必须等待用户确认。

