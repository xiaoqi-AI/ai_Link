# 待确认问题

## GitHub

- 仓库已确认为公开 GitHub：`https://github.com/xiaoqi-AI/ai_Link`。
- 是否要为 `main` 配置 GitHub branch protection 或 ruleset？
- 是否需要启用 GitHub Discussions？
- 项目许可证已采用 Apache-2.0。
- 是否在 GitHub UI 开启公开仓和私有仓的 secret scanning / push protection？
- 是否给私有仓 `ai_Link-internal` 配置独立 branch protection 或 ruleset？
- GitHub Actions CI 已补充，是否将其纳入 branch protection 必需检查？
- Branch protection 建议清单已写入 `docs/00-governance/github-branch-protection.md`，并已补充 `github:safety` / `github:safety:json` 只读检查；远端保护、secret scanning 和 push protection 仍需在 GitHub UI 配置，并可用已登录 `gh` 或当前会话 `GH_TOKEN` / `GITHUB_TOKEN` 核验。
- MVP 已补充 `github:hardening` / `github:hardening:json`，用于生成 GitHub UI 加固工作单；它只写 `runtime/tmp/`，不修改 GitHub 设置。

## 产品方向

- 第一阶段公开定位已确认：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流。
- MVP 已采用 Apache-2.0 许可证、TypeScript / Node.js CLI、配置文件和 Codex skill 调用约定。
- 迭代边界已写入 `docs/00-governance/iteration-boundaries.md`，并已补充 `iteration:boundary` / `iteration:boundary:json` 作为本轮需求、预期开发工作、验证和边界控制的机器可读入口；后续是否需要把更多 L1/L2 人工门槛细化成独立状态机，仍待确认。
- 首批 provider 已覆盖：mock/local-dry-run、openai-compatible、DeepSeek、Kimi、豆包、Grok、Coze agent dry-run / local command。
- `ai-link workflow run` 已支持按阶段串联 route，默认 auto_ops 示例为 Grok 调研、Kimi 写稿、Coze agent workflow。
- 豆包 provider 已按火山方舟 OpenAI-compatible Chat API 接入；真实调用仍需用户配置 `ARK_API_KEY`。
- 扣子已用本机命令适配作为公开兜底；后续真实接入是否优先走 API 或 MCP 仍需确认。
- 是否需要把 `examples/auto-ops/` 扩展成完整示例项目或保持轻量？
- `CHANGELOG.md`、`docs/releases/v0.1.0.md`、`docs/00-governance/release-process.md` 和 `release:plan` 已补充；是否需要发布 npm 包、创建 `v0.1.0` GitHub Release，或继续只支持仓库本地运行？

## 技术与部署

- AI Link CLI 已采用 TypeScript / Node.js；统一授权中枢公开骨架已采用 Node.js / Express。
- MVP 已补充 `ai-link config validate`、GitHub Actions CI 和 fresh clone 验证脚本。
- MVP 已补充 `package:check` / `package:check:json`，用于在不发布 npm 的前提下模拟打包并检查公开包内容。
- MVP 已补充 `package:install-smoke` / `package:install-smoke:json`，用于在不发布 npm 的前提下安装本地 tarball 并验证安装后的 CLI。
- MVP 已补充 `next:actions` / `next:actions:json`，用于汇总本地基线、GitHub 加固、Bitwarden 配置、provider-live 和 v0.1 发布决策的下一步行动。
- MVP 已补充 `maintainer:pack` / `maintainer:pack:json`，用于把 GitHub UI、Bitwarden、provider-live、release decisions 和发布渠道动作折叠成维护者操作包。
- MVP 已补充 `github:safety` / `github:safety:json`，用于检查公开仓本地治理基线并在可用时只读核验 GitHub 远端安全设置。
- MVP 已补充 `github:hardening` / `github:hardening:json`，用于把 branch protection、required `Verify`、secret scanning 和 push protection 的人工配置证据单独输出。
- MVP 已补充 `github:hardening:next` / `github:hardening:next:json`，用于输出 GitHub UI 链接、只读验证命令和公开安全的 release decision 更新预览。
- MVP 已补充 `release:plan` / `release:plan:json`，用于检查 changelog、release notes、发布流程、tag 计划和 npm 发布决策项。
- MVP 已补充 `release:decisions` / `release:decisions:json` / `release:decisions:strict`，用于把 v0.1 的人工发布决策记录为公开安全、机器可读的 pending/approved/waived 状态。
- MVP 已补充 `release:decisions:next` / `release:decisions:next:json`，用于为每个 pending 决策生成公开安全的 preview / write 命令。
- MVP 已补充 `release:decisions:update`，用于在人工确认后预览或写入公开安全决策证据；默认不写文件，只有加 `--yes` 才会更新记录。
- MVP 已补充 `release:manual-gates` / `release:manual-gates:json`，用于把 GitHub 保护、secret scanning / push protection、npm 发布决策和 provider-live 成本审批拆成 owner、动作和完成证据。
- MVP 已补充 `release:evidence` / `release:evidence:json`，用于生成脱敏发布证据包并限制默认输出到 `runtime/tmp/`。
- MVP 已补充 `release:readiness` / `release:readiness:json`，用于区分仓库内发布基线和 GitHub UI / npm 发布决策等人工确认项。
- MVP 已补充 `external:preflight` / `external:preflight:json`，用于在触碰 Bitwarden、GitHub UI 或 release decisions 前确认公开仓干净、同步且关键报告可用。
- MVP 已补充 `roadmap:next` / `roadmap:next:json`，用于把 v0.1 本地基线、外部人工门槛、v0.2 真实 provider 验收、skill 创作、agent/connector 扩展和后续 SDK 拆成公开安全路线图。
- MVP 已补充 `docs/quickstart.md`，用于公开用户无密钥、无真实模型调用的 5 分钟试用路径。
- Provider dry-run 验收已补充；真实调用验收仍需用户本机通过 Bitwarden Secrets Manager 注入 provider key，或 GitHub Actions 通过 `BW_ACCESS_TOKEN` 临时读取 Bitwarden secret。
- 统一授权中枢是否继续部署到 `voice.xiao-qi-ai.com` 的 Render Web Service，并启用 Cloudflare Access？
- 是否为 Render 服务启用付费持久盘，或长期坚持浏览器登录态只放本地执行器？
- 是否需要移动端、小程序或浏览器插件？
- 真实微信、朱雀AI、抖音、小红书、知乎、头条连接器的优先级和私有实现位置仍需确认。
- 真实平台登录、验证码、续登、正式发布确认和内容审核属于人工协助边界；是否需要专门设计“人工协助队列”和移动端审批体验仍需确认。

## 知识库

- 当前已建立项目镜像目录，是否需要进一步更新 `D:\codex_workplace\llm-wiki` 的全局索引、图谱和总览？
- 哪些内容适合长期沉淀，哪些只应保留在项目仓库？
