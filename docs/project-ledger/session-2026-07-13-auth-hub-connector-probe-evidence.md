# Auth Hub 显式连接器探测证据

日期：2026-07-13

状态：实现与本地安全测试完成，等待基于 PR #22 的堆叠 PR 审查；未执行真实平台调用。

## 背景

PR #22 让 Auth Hub 能看到本地执行器是否在线、加载了哪些 private connector，但心跳不能证明真实账号、凭据或平台 API 可用。本轮把 `platform_auth_collect` 的少量只读健康操作与状态中枢连接起来，同时关闭 mock 伪成功、共享 token 冒充、迟到结果和结果重放风险。

## 决策

1. probe 必须由任务创建者显式设置 `options.evidenceIntent=connector_probe`，状态读取和定时刷新不会自动调用平台。
2. 首批 allowlist 仅为 `xiaohongshu/check_session`、`wechat_official/check_health`、`github/check_auth`；搜索与交互登录不生成证据。
3. 生产 `AI_LINK_EXECUTOR_TOKEN` 必须绑定 `AI_LINK_EXECUTOR_ID`；每个执行器进程生成新的随机 session id。
4. probe 只租给同一绑定身份、同一新鲜 session、且已报告目标 private capability 的执行器；服务端签发一次性 `leaseId`。
5. Hub 依据任务原始 platform/operation 重新规范化结果，忽略 connector 自报时间，只保存稳定结论和服务端 TTL。
6. Postgres 在同一事务中条件更新任务终态、upsert 最新 probe 和写审计；旧 lease、错误 session、租约过期和重复提交不能刷新证据。
7. 成功只写入 `verifiedOperations`；`canRunReal` 只适用于列出的健康操作，不代表平台级写权限或发布能力。
8. 最新负面证据覆盖旧成功；过期后失败关闭，不回退到历史成功。

## 公开行为

- `GET /api/connectors` 的 `executorRuntime.connectors[*]` 增加 probe 状态、服务端有效期和 `verifiedOperations`。
- `GET /api/auth-status` 汇总 `ready/unverified/needs_action/blocked`，旧人工失败任务不会压住更新的成功 probe。
- `auth-hub:status:strict -- --platform <platform>` 只检查目标平台；`needs_action`、过期、预留、阻断和缺失平台均返回非零退出码。
- UI 显示“探测状态、已验证操作、有效期至”，并明确单操作成功不等于整个平台可用。

## 安全边界

- API、UI 和审计不返回 executor session、lease ID、heartbeat revision、客户端时间、原始结果、diagnostics、账号/仓库详情、路径或私有响应。
- mock、未绑定 executor、缺少 session、错误 lease 和普通平台任务不能形成正向证据。
- 本轮没有读取真实 token、Cookie、Profile、二维码或账号信息，没有调用 GitHub、公众号或小红书真实接口。
- `runtime/private/` 继续保持 Git 忽略，本轮未提交其内容。

## 验证

- 完整测试通过：核心测试 74 项、Auth Hub 测试 162 项，共 236 项。
- 新增端到端安全测试覆盖身份/session/lease 绑定、未绑定令牌冒用拒绝、mock 拒绝、重放、失败覆盖、服务端时间和 API/UI 脱敏。
- TypeScript 检查、36 项打包边界检查、369 个公开文件的敏感扫描和依赖高危审计通过，依赖漏洞为 0。
- 本机远程形态烟测 14 项通过，覆盖登录、权限隔离、任务、审批、执行器、审计和脱敏；测试服务已停止。
- 治理检查通过；部署蓝图检查 0 项失败、7 项本机环境警告。远程就绪报告仍有 3 个外部门禁：专用域名不可达、生产/烟测环境变量未配置、Cloudflare Access Service Auth 未配置。
- 提交 `a729eee` 的 fresh clone 验收通过，耗时约 233 秒；临时克隆完成依赖重装、完整测试、打包安装、治理报告、Auth Hub 工具和安全扫描。

## 后续人工门禁

1. 合并 PR #22，再审查和合并本轮堆叠 PR。
2. 为远程 Auth Hub 配置独立域名、Render/Postgres、Cloudflare Access 和生产 secret；`AI_LINK_EXECUTOR_ID` 必须与本机执行器一致。
3. 由负责人逐平台批准一次低频真实 probe。建议顺序：GitHub `check_auth`、公众号 `check_health`、小红书 `check_session`。
4. 出现验证码、风控、限流、真实费用、IP 白名单或写操作时立即停止并进入详细人工决策卡。
