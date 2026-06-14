# AI Link 工作空间

`ai_Link` 是一个公开 GitHub 项目，当前处于工作空间初始化阶段。这个仓库先建立可持续维护的基础：清晰入口、用户指引、公开协作规则、知识库镜像和 Git 同步流程。具体产品方向仍待确认。

## 当前状态

- 阶段：工作空间初始化
- 方向草案：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流
- GitHub：`https://github.com/xiaoqi-AI/ai_Link`
- 可见性：公开仓库
- 默认分支：`main`
- 本地路径：`G:\codex_workpace\ai_Link`
- 知识库镜像：`D:\llm-wiki\wiki\projects\ai_Link`
- 内部私有仓：`https://github.com/xiaoqi-AI/ai_Link-internal`
- 业务范围：待确认，不在初始化文档中提前定案

## 用户入口

- 使用指引：`docs/user-guide.md`
- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 协作规则：`AGENTS.md`
- 贡献说明：`CONTRIBUTING.md`
- 安全反馈：`SECURITY.md`
- 治理说明：`docs/00-governance/workspace-governance.md`
- GitHub 维护规则：`docs/00-governance/public-github-maintenance.md`
- 用户指引维护规则：`docs/00-governance/user-guidance-policy.md`
- 待确认问题：`docs/00-governance/open-questions.md`

## 常用维护命令

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

重要会话结束时可运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-closeout.ps1 -Summary "本次完成的事情"
```

## 公开仓库维护原则

- 每次更新后，同步维护本地仓库、GitHub 远端和个人知识库镜像。
- 每次影响安装、启动、使用方式、交互流程或限制条件时，同步更新 `README.md` 和 `docs/user-guide.md`。
- 每次新增面向外部用户的行为时，补充 issue/PR 指引或相关说明。
- 不把密钥、token、二维码、登录状态、未脱敏截图、个人财务或交易信息、运行缓存、构建产物写入 Git 或知识库。

## 公开 / 私有双仓模式

本仓库是对外主仓，只放可以公开给用户和贡献者看的内容。内部规划、实验、供应商评估、运维说明和公开前审查放在私有 companion 仓 `xiaoqi-AI/ai_Link-internal`。

从内部仓同步到公开仓前，必须完成脱敏和用户指引检查。公开仓不接收内部路径、内部判断、未确认承诺、账号信息或任何敏感资料。

## 当前产品探索

当前探索方向是：让 Codex 能按任务链接合适的模型、Agent 和工作流。

这一方向仍处于头脑风暴和草案阶段。公开草案见 `docs/10-product/ai-link-product-direction-draft.md`，其中内容用于讨论产品边界、配置方式和第一版 MVP，不代表已经完成或正式承诺的功能。

## 许可证

许可证尚未选择。公开仓库不等于自动授予开源使用许可；在许可证确认前，请不要假设本项目可被自由复制、修改或再发布。
