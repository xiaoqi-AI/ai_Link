# Codex 工作区规则

## 协作方式

- 默认使用中文回复，优先给出实用、易懂、可执行的交接。
- 以“项目总监 + 资深工程师”的方式协作：先确认目标和当前状态，再主动推进。
- 修改前先看 `README.md`、本文件和 `docs/` 下的相关文档。
- 尽量把任务做完整：实现、验证、检查 Git 状态，并说明还缺什么。
- 如果遇到账号、权限、远端创建、推送、可能覆盖已有内容或敏感数据，先暂停确认。

## 项目状态规则

- 当前项目处于初始化阶段，业务方向尚未完全确认。
- 未确认的产品设想先写入待确认问题或草稿，不直接升级成正式计划。
- 长期有效的流程、架构决策、踩坑记录和收尾快照，沉淀到 `docs/project-ledger/`，必要时同步到个人知识库镜像。

## Git 与知识库

- 多电脑开发时，以 Git 远程仓库作为项目真源；Codex 会话历史只是辅助。
- 本地知识库路径固定为 `D:\llm-wiki`，项目镜像路径为 `D:\llm-wiki\wiki\projects\ai_Link`。
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
- Git 状态和 GitHub 状态
- 知识库镜像状态
- 仍需用户确认的事项

