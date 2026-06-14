# Codex Skill 调用约定

## 基本原则

Skill 只声明意图，AI Link 负责路由，Codex 负责执行落地。

外部模型或 Agent 只提供调研、草稿、结构化建议或工作流结果，不直接获得本地命令执行权。Codex 继续负责读写文件、运行验证、处理 Git 和做安全判断。

## Skill 中的自然语言意图

用户制作新 skill 时，可以写自然语言说明：

```text
这个自动运营 skill 的调研阶段用 Grok，
文章初稿用 Kimi，
扣子负责工作流，
Codex 负责落地、检查和提交。
```

AI Link 可以生成候选 skill 配置，包括 route 和 workflow：

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地"
```

输出示例：

```yaml
version: 1
routes:
  auto_ops.research:
    provider: grok
    fallback:
      - deepseek
      - kimi
      - mock
    capabilities:
      - web_research
      - text
  auto_ops.article_draft:
    provider: kimi
    fallback:
      - deepseek
      - mock
    capabilities:
      - long_context
      - text
  auto_ops.agent_flow:
    provider: coze
    policy: external_action
    fallback:
      - mock
    capabilities:
      - agent_workflow
policies:
  external_action:
    blockSensitive: true
    allowOutbound: user-approved
    allowedProviderTypes:
      - coze
      - mock
    allowedModels:
      - coze-agent-*
      - mock-*
    budget:
      maxInputTokens: 20000
    auditTags:
      - external-action
      - human-approval
    dataClass: public
    approval:
      required: true
      mode: live
      reason: External action routes may call tools, automations, or third-party platforms.
workflows:
  auto_ops:
    description: 调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地
    stages:
      - name: research
        task: auto_ops.research
        inputFrom: original
      - name: article_draft
        task: auto_ops.article_draft
        inputFrom: original-and-previous
      - name: agent_flow
        task: auto_ops.agent_flow
        inputFrom: original-and-previous
```

第一版采用半自动流程：AI Link 生成候选配置，用户或 Codex 审核后再写入 `.ai-link/project.yaml` 或 `.ai-link/local.yaml`。识别到 Agent workflow 时，候选 route 会带上 `external_action` policy、provider type gate、model pattern gate、预算 gate 和审计 metadata；直接 `run` 真实执行需要 `--approve-policy`，workflow 真实执行需要 `--approve-stage <stage>` 或 `--approve-all`。

推荐先预览，再显式写入本机 local 配置：

```powershell
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi" --write .ai-link/local.yaml --diff
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi" --write .ai-link/local.yaml --diff --json
npm run ai-link -- skill draft --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi" --write .ai-link/local.yaml --yes
```

安全规则：

- 只有加 `--yes` 才会写文件；否则只打印预览。
- 加 `--diff` 会显示本次合并将新增或更新哪些 route、workflow 和 policy。
- 加 `--json` 会把写入预览或写入结果输出为结构化对象，供 Codex skill 或 CI 读取。
- 默认推荐写 `.ai-link/local.yaml`，该文件不进入 Git。
- 写 `.ai-link/project.yaml` 需要额外加 `--allow-public-config`，避免误改公开配置。

如果只想生成 route，不生成 workflow，可以继续使用兼容命令：

```powershell
npm run ai-link -- skill draft-route --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi"
```

## Skill 调用工作流

当 skill 已经有 route 和 workflow 配置时，Codex 可以直接调用 AI Link 工作流：

```powershell
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿"
npm run ai-link -- workflow run auto_ops --dry-run --input "调研一个公开选题并写初稿" --output runtime/tmp/auto-ops-workflow.json
```

只运行其中几个阶段：

```powershell
npm run ai-link -- workflow run auto_ops --stages research,article_draft --dry-run --input "调研一个公开选题并写初稿"
```

第一版工作流按顺序执行 stage，并把前序 stage 的输出交给后续 stage。比如 `auto_ops` 默认是：

```yaml
workflows:
  auto_ops:
    stages:
      - name: research
        task: auto_ops.research
        inputFrom: original
      - name: article_draft
        task: auto_ops.article_draft
        inputFrom: original-and-previous
```

可复制的 Codex skill 示例见 `examples/codex-skills/auto-ops-ai-link/SKILL.md`。

## 会话覆盖

会话指令可以覆盖默认路由：

```powershell
npm run ai-link -- run auto_ops.research --provider deepseek --dry-run --input "调研公开资料"
```

这对应用户在 Codex 会话中说：

```text
这次调研不用 Grok，改用 DeepSeek。
```

## 输出交接

Provider 返回的结果应被 Codex 视为输入材料，而不是最终事实或最终工程动作。Codex 后续应继续完成：

- 对输出进行校验、引用和去敏。
- 根据项目规则写入文档或代码。
- 运行测试、构建或治理脚本。
- 检查 Git 状态并按授权同步。

当 skill 需要稳定读取 AI Link 结果时，推荐使用结构化输出文件：

```powershell
npm run ai-link -- workflow run auto_ops --dry-run --input "公开任务说明" --output runtime/tmp/auto-ops-workflow.json
npm run ai-link -- workflow run auto_ops --dry-run --input "公开任务说明" --record
npm run ai-link -- runs list --limit 5
npm run ai-link -- workflow run auto_ops --dry-run --stages research --input "公开任务说明" --record
npm run ai-link -- workflow run auto_ops --dry-run --resume-from latest --input "公开任务说明"
npm run ai-link -- workflow run auto_ops --dry-run --resume-from <record-id> --from-stage article_draft
```

`--output` 会写入完整 JSON 结果，默认不覆盖已有文件；确需覆盖时显式加 `--force`。该参数只允许写入 `runtime/tmp/`，该目录默认不进入 Git，也不进入知识库镜像。需要直接把 JSON 打到 stdout 时，可以继续使用 `--json`。

`--record` 会把本次调用的脱敏运行记录写入 `runtime/tmp/ai-link-runs/`，并维护本地 `index.json`。记录不保存原始 input，只保存 input 长度、配置选择和结构化结果；但 provider 输出仍可能包含任务内容，因此这些记录仍属于本地运行态，不提交 Git、不同步知识库。需要读取完整记录时，先用 `runs list` 找到 id，再运行 `runs show <id> --json`。需要从已有 workflow 记录继续执行时，使用 `workflow run <workflow> --resume-from <id|latest>`；如果记录已经包含后续阶段但需要重跑，可加 `--from-stage <stage>`。

当本次 skill 执行对应授权中枢里的某个 task 时，可以在 `--record` 后追加审计摘要：

```powershell
npm run ai-link -- runs submit-audit latest --task-id <auth-hub-task-id>
```

该命令只把 run record 顶层 `audit` 的白名单字段写入授权中枢审计日志，不改变 task 状态，也不会上传原始 input、原始 output、密钥或 token。默认读取 `AI_LINK_CODEX_TOKEN`，本地开发地址可使用默认 dev token；公网地址必须显式配置 token。

本地联调时可以直接运行：

```powershell
npm run auth-hub:audit-smoke
```

该 smoke 会自启动或复用本地授权中枢，生成 dry-run workflow run record，提交 audit，并验证 `eventType=ai_link.audit` 查询结果。
