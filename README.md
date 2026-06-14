# AI Link 工作空间

这是 `G:\codex_workpace\ai_Link` 的项目入口。当前状态是初次会话初始化：先建立文档、治理、知识库镜像和 Git 基线，具体产品方向后续再确认。

## 当前状态

- 阶段：工作空间初始化
- 本地路径：`G:\codex_workpace\ai_Link`
- 知识库镜像：`D:\llm-wiki\wiki\projects\ai_Link`
- GitHub 远端：待授权后创建或绑定，建议仓库名 `ai_Link`
- 业务范围：待确认，不在首轮文档中提前定案

## 快速入口

- 协作规则：`AGENTS.md`
- 治理说明：`docs/00-governance/workspace-governance.md`
- Git 与同步策略：`docs/00-governance/storage-sync-and-git-policy.md`
- 收尾清单：`docs/00-governance/session-closeout-checklist.md`
- 待确认问题：`docs/00-governance/open-questions.md`
- 项目账本：`docs/project-ledger/README.md`

## 常用命令

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

重要会话结束时可运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-closeout.ps1 -Summary "本次完成的事情"
```

## 边界

不要把密钥、token、二维码、登录状态、未脱敏截图、个人财务或交易信息、运行缓存、构建产物写入 Git 或知识库。需要外部账号授权、GitHub 登录、远端推送或覆盖已有内容时，先暂停确认。

