# AI Link 产品方向草案

状态：第一版 MVP 已按本草案启动实现，后续仍可迭代。

日期：2026-06-14

## 一句话定位

AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流。

第一版主要服务 Codex 本地工作流，同时把能力抽象成公开 GitHub 用户可以复用的配置、适配器和调用约定。后续可扩展为 SDK、网页管理台或更完整的平台服务。

## 已确认方向

- 公开产品名：AI Link。
- 命令行名称：`ai-link`。
- 核心模块名称：`router`、`providers`、`skills`、`policies`。
- 第一版不急着做 SDK。
- 第一版优先支持 Codex 本地会话和 Codex skill 工作流。
- 公开仓提供可复用能力；私密配置、密钥和内部策略留在用户本机或私有仓。
- 支持模型接入，也支持扣子等 Agent / workflow 平台接入。
- 使用 Apache-2.0 许可证。

## 设计原则

1. Codex 做总控。

   Codex 负责理解项目上下文、读写本地文件、执行命令、检查 Git 状态和做安全判断。外部模型或 Agent 主要提供调研、草稿、判断、结构化建议或工作流结果。

2. 按任务路由，而不是按模型硬编码。

   用户可以说“这个调研阶段用 Grok，文章阶段用 Kimi”，AI Link 将其转换成可执行的路由配置。

3. 公开能力和私密配置分离。

   公开仓放接口规范、示例配置、路由模板和安全边界；API key、私有 endpoint、内部策略、供应商评价和未脱敏材料不进入公开仓。

4. 默认安全，允许用户按场景授权。

   是否把项目内容、文件摘要、网页结果或其他上下文发给外部模型，应由用户配置和会话指令决定。涉及密钥、登录态、二维码、私密截图、财务或交易资料时默认拦截。

## 第一版使用方式

### 会话临时指定

用户可以在 Codex 会话中自然语言指定：

- “这一步用 Grok 做初期调研，Codex 汇总。”
- “这个 skill 的写作阶段用 Kimi。”
- “扣子负责跑已有 Agent 流程，Codex 负责落地到项目文档。”

### Skill 路由

用户制作新 skill 时，可以直接用自然语言说明不同阶段使用不同模型或 Agent：

```text
这个自动运营 skill 的调研阶段用 Grok，
文章初稿用 Kimi，
发布前检查和项目落地继续由 Codex 处理。
```

AI Link 负责把这种意图转成路由配置，并在执行时调用合适的 provider。

### 命令行调用

第一版可以提供命令行入口：

```powershell
ai-link run auto_ops.research --model grok
ai-link run auto_ops.article --model kimi
ai-link run coze.workflow --provider coze
```

命令行主要用于 Codex、本地脚本和高级用户复用。

## 配置优先级

配置从高到低按以下顺序生效：

```text
会话临时指定 > 项目 local 私有配置 > 项目公开配置 > 用户全局配置 > 默认配置
```

建议分层：

- 会话临时指定：只在当前 Codex 会话或当前命令生效。
- 项目 local 私有配置：`.ai-link/local.yaml`，只在当前项目本机生效，不进入 Git。
- 项目公开配置：`.ai-link/project.yaml`，可提交到公开仓，只放非敏感路由和示例。
- 用户全局配置：`%USERPROFILE%\.ai-link\config.yaml`，用于多项目共享个人 provider 配置。
- 默认配置：AI Link 内置的保守默认值。

## 密钥与凭据

第一版应支持多种方式，但公开文档默认推荐环境变量：

- 环境变量：例如 `GROK_API_KEY`、`KIMI_API_KEY`、`DEEPSEEK_API_KEY`。
- 用户全局配置：只存用户本机，不进入项目仓库。
- 项目 local 私有配置：适合单项目覆盖，必须加入 `.gitignore`。
- 系统凭据管理器：作为后续增强方向预留。

示例配置只应展示 `apiKeyEnv` 这类变量名，不展示真实 key。

## Provider 类型

AI Link 不只面向模型，也面向 Agent 和工作流平台。

- 模型 provider：Grok、Kimi、DeepSeek、豆包、OpenAI-compatible、自定义 HTTP 模型。
- Agent / workflow provider：扣子，以及未来其他 Agent 平台或自动化工作流。

建议抽象字段：

- `provider`：供应方或平台，例如 `grok`、`kimi`、`coze`。
- `model`：具体模型或版本。
- `capabilities`：能力标签。
- `route`：任务到 provider 的映射。
- `policy`：数据出站和安全约束。

## 能力标签

第一版实现可以从文本能力开始，但配置层应预留完整能力边界：

- `text`
- `web_research`
- `file_summary`
- `image_generation`
- `image_understanding`
- `agent_workflow`
- `code_reasoning`
- `long_context`
- `structured_output`

## 示例路由

```yaml
routes:
  auto_ops.research:
    provider: grok
    capabilities:
      - web_research
      - text
    fallback:
      - deepseek
      - kimi

  auto_ops.article_draft:
    provider: kimi
    capabilities:
      - long_context
      - text
    fallback:
      - doubao
      - deepseek

  auto_ops.agent_flow:
    provider: coze
    capabilities:
      - agent_workflow

  image.followup:
    provider: codex
    capabilities:
      - text
      - code_reasoning
```

## 第一版 MVP 建议

1. 定义配置文件格式和优先级。
2. 定义 provider adapter 接口。
3. 支持至少一个通用 OpenAI-compatible provider。
4. 支持 DeepSeek 和 Kimi 作为首批示例 provider。
5. 支持 Grok provider；为扣子预留 Agent / workflow provider 类型。
6. 提供 `ai-link run` 的最小命令行入口。
7. 提供 Codex skill 调用约定。
8. 提供安全策略：敏感信息不出站、密钥不进 Git、路由可审计。
9. 提供自动运营项目示例：Grok 调研、Kimi 写作、Codex 落地。

## 非目标

- 第一版不做完整 SDK。
- 第一版不做复杂网页管理台。
- 第一版不替代 Codex 的工程执行能力。
- 第一版不承诺所有 provider 的完整能力都立即可用。
- 第一版不在公开仓保存任何真实密钥、账号、登录态或内部策略。

## 待确认问题

- 是否需要补充豆包 provider。
- 是否需要发布 npm 包，或继续只支持仓库本地运行。
- 扣子接入优先走 API、命令行、MCP，还是其他方式。
- 是否需要将 auto-ops 从轻量示例扩展成完整示例项目。
