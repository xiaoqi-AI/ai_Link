# 待确认问题

## GitHub

- 仓库已确认为公开 GitHub：`https://github.com/xiaoqi-AI/ai_Link`。
- 是否要为 `main` 配置 GitHub branch protection 或 ruleset？
- 是否需要启用 GitHub Discussions？
- 项目许可证尚未确认，后续需要选择是否添加 `LICENSE`。
- 是否在 GitHub UI 开启公开仓和私有仓的 secret scanning / push protection？
- 是否给私有仓 `ai_Link-internal` 配置独立 branch protection 或 ruleset？

## 产品方向

- 当前草案定位：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流。是否确认作为第一阶段公开定位？
- 第一版主要服务 Codex 本地工作流，同时允许 GitHub 其他用户复用。是否需要同步定义更明确的目标用户画像？
- 第一版是否优先实现命令行 `ai-link`、配置文件和 Codex skill 调用约定？
- 首批必须跑通哪些 provider：DeepSeek、Kimi、Grok、豆包、扣子、OpenAI-compatible，还是先做其中一部分？
- 扣子接入优先作为模型 provider、Agent / workflow provider，还是两者都支持？
- 自然语言 skill 说明如何转换为路由配置？
- 是否需要提供公开示例项目，例如自动运营项目：Grok 调研、Kimi 写作、Codex 落地？
- 项目许可证尚未确认；最终开源时选择 MIT、Apache-2.0，还是其他许可证？

## 技术与部署

- 是否已有指定技术栈？
- 是否需要移动端、小程序或浏览器插件？
- 是否需要部署到云服务或仅本地使用？

## 知识库

- 当前已建立项目镜像目录，是否需要进一步更新 `D:\llm-wiki` 的全局索引、图谱和总览？
- 哪些内容适合长期沉淀，哪些只应保留在项目仓库？
