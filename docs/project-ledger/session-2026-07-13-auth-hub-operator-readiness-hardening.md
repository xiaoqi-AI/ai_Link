# Auth Hub 操作可信度加固

日期：2026-07-13

状态：本地实现与完整验证完成；等待 GitHub CI。知识库镜像在合并后同步。未调用真实平台、未创建远程资源、未读取生产凭据。

## 背景

模块 2 状态中心、模块 5 平台授权连接器和模块 6 远程部署合同已进入本地主线，但安全审计发现三个会影响后续真实验收的问题：普通执行器结果未统一绑定租约；GitHub 探针证据可能跨 scope 或目标复用；远程状态客户端、执行器和 smoke 可能把 Bearer 或 Cloudflare Service Auth 凭据带到未批准目标或重定向地址。另有公开结果合同允许非搜索操作携带任意条目。

## 本轮完成

1. 所有执行器结果必须绑定当前 token executor、进程 session 和一次性 lease，并在租约有效期内结算一次；未领取、错误绑定、过期租约、终态改写和重放返回冲突。
2. MemoryStore 与 PostgresStore 使用同一结算语义；Postgres 在单一事务中写入任务终态、artifact、审批和审计，失败时整体回滚。
3. GitHub `check_auth` 探针按 scope 与目标仓库隔离。目标仅保存由服务端密钥生成的 HMAC 摘要，公开状态只显示 scope 与 `target_bound`。
4. 只有 `xiaohongshu/search_content` 允许非空 `items`；其他授权、会话和健康操作携带条目时合同失败关闭。
5. 远程 Auth Hub 目标必须是显式批准的 HTTPS hostname；不再隐式批准建议域名，不支持通配符。loopback 不携带 Service Auth，相关客户端不自动跟随重定向。
6. `authStatus.summary` 在平台过滤后重新计算；远程部署报告把合同缺陷和待负责人确认的部署决策分开呈现。
7. 顶层下一步报告移除已经完成的历史 PR 合并任务，并把平台只读验收与远程部署门禁更新为当前真实状态。

## 价值

- 状态中心不能被未领取任务、旧执行器进程或结果重放改写。
- 一个 GitHub 私有仓库或只读 scope 的成功不再被误解释为其他仓库或权限可用。
- Bearer 和 Cloudflare Service Auth 凭据不会因错误配置、loopback 或 3xx 跳转离开批准目标。
- 公开任务结果不能用伪造条目向控制台或依赖项目注入标题、摘要和 URL。
- 项目负责人能区分“代码合同缺失”和“远程部署决策尚未批准”，避免错误推进或反复询问。

## 已完成的定向验证

- 任务租约、探针证据、状态客户端、执行器心跳、远程就绪报告和平台合同共 76 项测试通过。
- JavaScript 与 PowerShell 语法检查通过。
- `git diff --check` 通过；仅有现有 Windows 行尾提示。

## 已完成的完整验证

- CLI / source 测试 74/74 通过。
- Auth Hub 测试 216/216 通过。
- `npm run check` 通过。
- 安全扫描覆盖 395 个文件并通过。
- `npm audit --omit=dev --audit-level=high`：0 个漏洞。
- release readiness：150 项通过、0 项失败、1 项人工门禁。
- PostgreSQL 16 真实集成验证由 GitHub CI 执行，本地没有测试数据库时按设计跳过。

## 保持不变的人工门禁

1. 首次 GitHub 真实只读验收仍需负责人确认非关键私有仓、三个只读 scope、凭据来源、频率和停止条件。
2. Auth Hub 通知渠道和发送频率仍需负责人决定；当前只有低噪声变更信号，没有真实消息投递。
3. 远程部署仍需确认专用域名、区域、Render 费用、Cloudflare Access 邮箱与 Service Auth、secret store、原生子域名策略、备份/PITR 和恢复负责人。
4. 本轮不创建 Render、Cloudflare、DNS、数据库或真实平台资源，不自动运行真实 probe。
