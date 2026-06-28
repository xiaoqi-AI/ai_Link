# Codex 工作区规则

## 协作方式

- 默认使用中文回复，优先给出实用、易懂、可执行的交接。
- 以“项目总监 + 资深工程师”的方式协作：先确认目标和当前状态，再主动推进。
- 修改前先看 `README.md`、本文件和 `docs/` 下的相关文档。
- 尽量把任务做完整：实现、验证、检查 Git 状态，必要时同步知识库和 GitHub。
- 如果遇到账号、权限、可能覆盖已有内容或敏感数据，先暂停确认。

## 公开 GitHub 规则

- 本仓库是公开 GitHub 仓库：`https://github.com/xiaoqi-AI/ai_Link`。
- 私有内部 companion 仓：`https://github.com/xiaoqi-AI/ai_Link-internal`。
- 每次有效更新都要维护 GitHub 远端，完成后确认本地 `main` 与 `origin/main` 对齐。
- 对公开仓库默认更谨慎：提交前检查敏感信息、私密路径、登录态、二维码、截图和个人资料。
- 影响外部用户理解或使用的改动，必须同步更新 `README.md`、`docs/user-guide.md` 或 `.github` 模板。
- 影响协作流程、发布流程、分支策略或安全边界的改动，必须同步更新 `docs/00-governance/`。
- 内部材料先进私有仓；确认可公开后，再脱敏整理到本公开仓。

## 项目状态规则

- 当前项目处于初始化阶段，业务方向尚未完全确认。
- 未确认的产品设想先写入待确认问题或草稿，不直接升级成正式计划。
- 长期有效的流程、架构决策、踩坑记录和收尾快照，沉淀到 `docs/project-ledger/`，必要时同步到个人知识库镜像。

## 迭代边界默认执行

- “迭代边界”在本项目中指每轮开发前的需求、预期工作、验证和边界控制约定，不只是版本路线图。
- 进入目标模式或实质开发前，先按 `docs/00-governance/iteration-boundaries.md` 明确本轮目标、非目标、预计改动范围、验收方式、人工门禁和停止条件。
- 如果开发中发现实际路径和预期不符，优先暂停扩张、说明偏差、给出选项，再由用户确认是否扩围。
- 默认防止过渡开发：不因为“顺手”新增 SDK、真实 connector、长期脚本、大型抽象或平台能力；除非它直接服务本轮需求或用户明确批准。
- 若出现 token 消耗异常、反复失败、目标不清、真实费用、账号权限、发布动作或敏感数据风险，先收敛并报告，不继续用代码掩盖需求不确定性。
- 通用的迭代边界经验沉淀到 Codex 上下文；AI Link 特有的经验、命令、门禁和风险沉淀到本仓库上下文、治理文档和 `docs/project-ledger/`，只做追加更新，不覆盖既有约定。

## AI Link 项目经验补充

- 当前优先级是保持 v0.1 本地 MVP、mock / dry-run、公开文档、release readiness 和知识库镜像稳定；GitHub UI、Bitwarden、provider-live、npm 发布和真实 connector 都是独立门禁，不应被普通迭代顺带推进。
- 下一步不明确时，先用 `npm run iteration:boundary:json`、`npm run next:actions:json`、`npm run roadmap:next:json`、`npm run release:decisions:json`、`npm run bws:next:json` 对齐现状，再选择一个主方向推进。
- 新增 provider、agent、skill 或 connector 前，先确认公开契约、配置来源、密钥边界、dry-run / mock 验收、policy gate 和文档入口；真实调用和真实账号配置等待人工确认。
- 项目输出默认分层：公开仓保存可公开代码、mock、脱敏文档和治理证据；私有仓、本机 `runtime/private/` 或 secret manager 保存真实登录态、密钥、截图、原始响应和未脱敏资料。
- 目标模型或外部 Agent 给出的扩展建议，先进入待确认问题、项目计划或下一轮边界卡；除非用户明确批准，不直接升级成 SDK、生产授权系统、真实平台 connector 或长期自动化。
- 每次重要迭代结束时，项目经验优先写入 `docs/project-ledger/`，影响后续协作规则时再补 `AGENTS.md` 或 `docs/00-governance/`，并同步知识库镜像。

## Git 与知识库

- 多电脑开发时，以 GitHub 远端仓库作为项目真源；Codex 会话历史只是辅助。
- 公开仓与私有仓都要推送到 GitHub；公开仓面向用户，私有仓面向内部治理。
- 本地知识库路径固定为 `D:\codex_workplace\llm-wiki`，项目镜像路径为 `D:\codex_workplace\llm-wiki\wiki\projects\ai_Link`。
- 每次重要工作结束前，优先运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

## 安全边界

不要提交或同步：

- `.env`、token、API key、密钥、证书、二维码、登录状态
- 私密截图、未脱敏个人信息、个人财务或交易记录
- `node_modules`、虚拟环境、构建产物、缓存、日志
- `runtime/private/` 下的任何内容

## 汇报格式

默认说明：

- 改了什么
- 做过哪些验证
- GitHub 是否已同步
- 知识库镜像状态
- 仍需用户确认的事项
