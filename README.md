# AI Link 工作空间

`ai_Link` 是一个公开 GitHub 项目，当前处于工作空间初始化阶段。这个仓库先建立可持续维护的基础：清晰入口、用户指引、公开协作规则、知识库镜像和 Git 同步流程。具体产品方向仍待确认。

## 当前状态

- 阶段：工作空间初始化
- GitHub：`https://github.com/xiaoqi-AI/ai_Link`
- 可见性：公开仓库
- 默认分支：`main`
- 本地路径：`G:\codex_workpace\ai_Link`
- 知识库镜像：`D:\llm-wiki\wiki\projects\ai_Link`
- 业务范围：待确认，不在初始化文档中提前定案

## 用户入口

- 使用指引：`docs/user-guide.md`
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

## 许可证

许可证尚未选择。公开仓库不等于自动授予开源使用许可；在许可证确认前，请不要假设本项目可被自由复制、修改或再发布。

