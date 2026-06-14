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

AI Link 可以生成候选路由配置：

```powershell
npm run ai-link -- skill draft-route --skill auto_ops --description "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地"
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
    fallback:
      - mock
    capabilities:
      - agent_workflow
```

第一版采用半自动流程：AI Link 生成候选配置，用户或 Codex 审核后再写入 `.ai-link/project.yaml` 或 `.ai-link/local.yaml`。

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
