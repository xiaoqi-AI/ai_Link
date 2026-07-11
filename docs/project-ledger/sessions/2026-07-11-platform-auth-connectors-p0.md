# 2026-07-11 平台授权与采集连接器 P0.1

## 结论

AI Link 已接收 Hermes Agent 的平台授权连接器脱敏交接，并将其拆为独立于 GSC 的 P0 迭代。当前只推进公开仓 P0.1：合同、私有加载边界、最小任务调度和脱敏测试；真实平台动作继续受人工门禁约束。

## 关键决策

- AI Link 负责授权状态、人工协助、重试、本地连接器执行和脱敏结果。
- Hermes 继续负责来源真实性、平台覆盖和业务流程，不直接管理 Cookie/Profile。
- 私有连接器代码进入内部仓，运行态只在本机 `runtime/private/`。
- 小红书首批只读；公众号官方 API 优先且首批只到健康检查/草稿；正式发布始终人工审批。
- 公众号 IP 白名单错误按固定出口问题处理，不解释成重新扫码。

## P0.1 改动

- 新增统一 `SessionStatus`、`ready` / `needs_action` / `blocked` 结果合同。
- 新增 `platform_auth_collect` 最小任务入口。
- 新增仅允许从 `runtime/private/` 加载的私有 connector 工厂。
- 小红书输出通过 allowlist 重建，具体笔记 URL 移除查询参数和 fragment。
- 失败任务保存脱敏 `blocked` 结果，便于上游读取稳定错误代码。
- 本地执行器不再把远端错误响应或私有连接器异常原文写入状态和日志。
- 审查时发现并关闭既有审批接口的默认批准漏洞：缺少显式 approve/reject 时现在返回 400。
- `begin_login` 在 P0.1 保持失败关闭，不会调用私有 interactive 方法。

## 安全边界

- 未读取、复制或修改任何既有 `runtime/private/` 文件。
- 未执行真实登录、扫码、验证码、公众号 API 或平台写操作。
- 未触发 Coze 主流程、Render 部署、GitHub Release 或 npm 发布。
- 公开文档不包含真实账号、凭据、二维码、Profile、内部路径或原始平台响应。

## 验证

- 定向平台合同、私有加载和任务流测试：24/24 通过。
- 全量测试：TypeScript/CLI 74/74，Auth Hub/治理 90/90，共 164/164 通过。
- TypeScript 检查：通过。
- 安全扫描：322 个公开文件通过。
- npm 包内容：28/28 通过；安装 smoke：10/10 通过。
- 治理检查和 `git diff --check`：通过。
- 独立代码审查：确认并修复“空决策默认批准”和“P0.1 interactive login 直接调用”两项风险；其余建议按失败关闭原则处理或留到真实平台验收。
- branch-head fresh clone：提交 `a494506` 从零克隆、安装和全链路复验通过（304.9 秒）。

## Git 与知识库

- 分支：`codex/platform-auth-connectors-p0`。
- GitHub Draft PR：`https://github.com/xiaoqi-AI/ai_Link/pull/9`。
- 知识库镜像：已同步并验证；`llm-wiki` 仓库存在大量跨项目既有改动，本轮未替用户合并提交或推送。

合并顺序注意：GSC PR #8 与本轮都会改动 connector registry / task runner。建议先合并 PR #8，再把本分支变基到最新 `main`，复核 GSC 与平台授权能力同时保留后再合并；不要用简单覆盖解决冲突。

## 后续人工门禁

1. P0.2 小红书：确认测试账号、只读关键词、测试时间窗和风控停止条件。
2. P0.3 公众号：确认 API 权限、secret manager、固定出口 IP、白名单和调用配额。
3. 任何草稿写入或正式发布：另行确认；正式发布每次审批。
