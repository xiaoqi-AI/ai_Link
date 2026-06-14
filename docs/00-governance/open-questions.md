# 待确认问题

## GitHub

- 仓库已确认为公开 GitHub：`https://github.com/xiaoqi-AI/ai_Link`。
- 是否要为 `main` 配置 GitHub branch protection 或 ruleset？
- 是否需要启用 GitHub Discussions？
- 项目许可证已采用 Apache-2.0。
- 是否在 GitHub UI 开启公开仓和私有仓的 secret scanning / push protection？
- 是否给私有仓 `ai_Link-internal` 配置独立 branch protection 或 ruleset？
- GitHub Actions CI 已补充，是否将其纳入 branch protection 必需检查？
- Branch protection 建议清单已写入 `docs/00-governance/github-branch-protection.md`，仍需在 GitHub UI 配置。

## 产品方向

- 第一阶段公开定位已确认：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流。
- MVP 已采用 Apache-2.0 许可证、TypeScript / Node.js CLI、配置文件和 Codex skill 调用约定。
- 首批 provider 已覆盖：mock/local-dry-run、openai-compatible、DeepSeek、Kimi、豆包、Grok、Coze agent dry-run / local command。
- `ai-link workflow run` 已支持按阶段串联 route，默认 auto_ops 示例为 Grok 调研、Kimi 写稿、Coze agent workflow。
- 豆包 provider 已按火山方舟 OpenAI-compatible Chat API 接入；真实调用仍需用户配置 `ARK_API_KEY`。
- 扣子已用本机命令适配作为公开兜底；后续真实接入是否优先走 API 或 MCP 仍需确认。
- 是否需要把 `examples/auto-ops/` 扩展成完整示例项目或保持轻量？
- 是否需要发布 npm 包，或继续只支持仓库本地运行？

## 技术与部署

- AI Link CLI 已采用 TypeScript / Node.js；统一授权中枢公开骨架已采用 Node.js / Express。
- MVP 已补充 `ai-link config validate`、GitHub Actions CI 和 fresh clone 验证脚本。
- MVP 已补充 `package:check` / `package:check:json`，用于在不发布 npm 的前提下模拟打包并检查公开包内容。
- MVP 已补充 `release:readiness` / `release:readiness:json`，用于区分仓库内发布基线和 GitHub UI / npm 发布决策等人工确认项。
- Provider dry-run 验收已补充；真实调用验收仍需用户本机通过 Bitwarden Secrets Manager 注入 provider key，或 GitHub Actions 通过 `BW_ACCESS_TOKEN` 临时读取 Bitwarden secret。
- 统一授权中枢是否继续部署到 `voice.xiao-qi-ai.com` 的 Render Web Service，并启用 Cloudflare Access？
- 是否为 Render 服务启用付费持久盘，或长期坚持浏览器登录态只放本地执行器？
- 是否需要移动端、小程序或浏览器插件？
- 真实微信、朱雀AI、抖音、小红书、知乎、头条连接器的优先级和私有实现位置仍需确认。

## 知识库

- 当前已建立项目镜像目录，是否需要进一步更新 `D:\llm-wiki` 的全局索引、图谱和总览？
- 哪些内容适合长期沉淀，哪些只应保留在项目仓库？
