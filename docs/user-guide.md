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

- 项目治理文档：`docs/00-governance/`
- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 配置说明：`docs/20-architecture/configuration.md`
- Provider 说明：`docs/20-architecture/provider-adapters.md`
- Codex Skill 调用约定：`docs/20-architecture/codex-skill-integration.md`
- Auto Ops 示例：`examples/auto-ops/`
- 项目账本：`docs/project-ledger/`
- 文档模板：`docs/90-templates/`
- 本地检查和知识库同步脚本：`tools/`

## 快速试用

```powershell
npm install
npm run ai-link -- doctor
npm run ai-link -- providers list
npm run ai-link -- run auto_ops.research --dry-run --input "调研一个公开选题"
```

如果没有外部模型 API key，可以先使用 `mock`：

```powershell
npm run ai-link -- run auto_ops.article_draft --provider mock --input "写一段文章草稿"
```

## 外部模型配置

真实调用 DeepSeek、Kimi、Grok 或 OpenAI-compatible provider 前，需要在本机配置环境变量：

```powershell
$env:DEEPSEEK_API_KEY="..."
$env:MOONSHOT_API_KEY="..."
$env:XAI_API_KEY="..."
```

不要把真实 key 写入公开仓库、issue、PR 或知识库。

## 当前不可假设

- 不要假设所有 provider 的高级能力都已经完整实现。
- 不要假设扣子工作流已在 MVP runtime 中可真实调用；当前是预留接口。
- 不要把私密数据、账号、token、二维码、登录态或未脱敏截图提交到 issue、PR 或仓库文件。
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
