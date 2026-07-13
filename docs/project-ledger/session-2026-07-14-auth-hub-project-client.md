# Auth Hub 项目客户端 MVP

日期：2026-07-14

状态：PR #38 已创建，本地验收完成，待 GitHub 必需检查与合并。真实平台调用和远程部署仍未发生。

## 背景

Auth Hub 已具备任务、状态、审批、审计和 connector 运行槽位，但 ParentingGame、Hermes Agent 等调用方仍缺少一个公开、稳定、失败关闭的项目客户端。若每个项目自行拼接 HTTP 请求，会重复处理 token、目标主机、Cloudflare Service Auth、重定向、超时、脱敏和轮询，并容易形成安全旁路。

本轮把模块 2“状态中心”、模块 5“平台授权连接器”和模块 6“远程 Auth Hub”串成一条可复用的调用路径，但不把三个模块误判为同一成熟阶段。

## 本轮目标

1. 新增公开 CLI `ai-link-auth-hub`，支持提交 `platform_auth_collect` 任务、查询指定任务，以及有限时长等待终态。
2. 客户端只从环境变量读取 Bearer token 和可能敏感的业务输入；不接受命令行明文 token。
3. 远程请求复用 Auth Hub 目标校验、Cloudflare Service Auth、禁用重定向、有界超时和严格响应合同。
4. 服务端以 `createdBy + workflow + requestId` 提供提交幂等，重试不重复创建任务。
5. 普通项目 token 只能读取自己创建的任务；拥有 `tasks:approve` 的管理方保持全局任务视图。
6. 补充中文接入文档、失败关闭测试、打包和安装验收。

## 非目标

- 不触发小红书、公众号或 GitHub 的真实调用。
- 不代替人工审批、登录、发布、费用或权限决策。
- 不创建 Render、Cloudflare、Postgres、DNS、邮箱或其他远程资源。
- 不在公开仓保存 token、OAuth 文件、Cookie、账号、目标仓库私密值或原始平台响应。
- 不修改 ParentingGame、Hermes Agent 或其他业务项目仓库。
- 不建设通用队列、缓存、SDK、多租户控制台或客户端内审批系统。

## 预计改动范围

- `src/authHub/`：项目客户端、请求合同和 CLI。
- `src/routes/api.js`、`src/storage/`：任务幂等和调用方读取隔离。
- `src/security/authHubOutbound.js`：项目客户端共用的远程目标约束。
- `tests/`：客户端、幂等、隔离和失败关闭回归。
- `package.json`、`tools/build-runtime.js`、包内容与安装检查。
- `README.md`、`docs/user-guide.md`、Auth Hub 架构和 connector 接入文档。

## 验收方式

1. 同一项目以相同 `requestId` 重试时返回同一个任务，不产生重复执行。
2. 项目 A 的普通 token 无法枚举或读取项目 B 的任务；管理 token 仍可管理全局任务。
3. 非法 URL、嵌入凭据、未批准远程主机、非 HTTPS、远程非标准端口和重定向全部在发送凭据前失败关闭。
4. 缺 token、超时、非 JSON、超大响应、异常 schema、401/403/429/5xx 均返回稳定错误码，不打印 token 或原始响应。
5. 等待具有最大时长、最大次数和最小间隔，不能无限轮询。
6. `npm test`、类型检查、安全扫描、治理检查、包内容检查、安装烟测和 fresh-clone 验证通过。

## 人工门禁

本轮代码和普通 PR 按用户授权可在 CI 通过后自行合并。以下动作仍必须另行向用户提交完整决策卡：真实平台调用、真实账号授权、生产 token 发放、远程资源创建或部署、费用、域名和访问控制变更。

## 停止条件

出现真实凭据暴露、需要扩展平台写权限、必须创建收费资源、无法证明任务隔离、重复失败或实际实现明显超出上述范围时，立即停止扩张并汇报。

## 安全审查处置

独立审查最初发现六项问题，已全部在进入 PR 前修复：

1. 项目 token 的 GitHub 权限现已在服务端绑定精确仓库与 scope，绕过 CLI 直接调用 API 仍会被拒绝。
2. 客户端分开报告 `accepted` 与 `ready`；只有 `completed + result.status=ready` 才输出 `ok=true`。
3. own-task 隔离只作用于 `project.*` 身份，不改变既有 Admin/Codex 跨角色读取合同。
4. Postgres 使用独立 `task_idempotency_keys` 主键和载荷摘要，并检测历史重复键；不再只依赖 advisory lock。
5. 提交响应绑定 workflow、platform、operation、requestId，查询响应绑定 task id；不匹配时失败关闭。
6. 轮询请求超时会收敛到剩余总预算，不会在总等待到期后再执行一个完整请求。

残余边界：远程 hostname 仍依赖维护者显式 allowlist 与受控 DNS；loopback 仅视为本机信任边界。真实 Postgres 并发集成由 GitHub 必需检查执行，本机无测试数据库时明确跳过，不以 mock 冒充。

## 本地验证

- `npm run check`：通过。
- `npm test`：通过；基础测试 `74/74`、Auth Hub `246/246`，Postgres 集成在本机无测试数据库时跳过。
- `npm run package:check`：`41/41` 通过。
- `npm run package:install-smoke`：`19/19` 通过，安装后的 `ai-link-auth-hub --help` 可运行。
- `npm run security:scan`：通过，扫描 406 个公开文件。
- `powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1`：通过。
- `npm run verify:fresh`：通过；从干净目录克隆、安装并复跑公开验证链路成功。

## 待完成

- PR #38 已创建，等待 `Verify` 与真实 Postgres integration 必需检查。
- 必需检查全部通过后按既有授权自行合并，不绕过 `main` 保护。
- 合并后同步并验证 AI Link 知识库镜像，再更新项目总监控制面与本账本的 GitHub 结果。
