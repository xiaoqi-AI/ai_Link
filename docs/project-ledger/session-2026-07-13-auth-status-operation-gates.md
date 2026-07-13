# Auth Hub 跨项目精确操作门禁

日期：2026-07-13

状态：公开实现、全量本地回归、fresh-clone 独立复核和中文交接已完成；等待 GitHub CI。未调用真实平台，未读取凭据，未创建远程资源。

## 背景

Auth Hub 已能返回平台级 `ready` 和 `verifiedOperations`，但仓库内的只读消费命令此前只按平台判断严格模式。这样会让依赖项目存在扩大解释风险：例如 GitHub `repo_read` 的成功证据可能被误当成 `actions_read` 也可用。P0.4 Hermes 联调明确要求不能用单个 `ready` 字符串放行平台覆盖，因此需要在消费端补充精确操作门禁。

历史交接文档还曾把内容站 `voice.xiao-qi-ai.com` 写成 Auth Hub 地址。该域名不承载 Auth Hub，继续复制会把只读凭据发往错误目标；当前出站 host allowlist 会拒绝，但文档仍必须修正。

## 本轮完成

1. `auth-hub:status` 新增可重复参数 `--require-operation "<platform>=<verified-operation>"`。
2. 操作要求自动收敛平台过滤范围，只有平台为 `ready` 且 `verifiedOperations` 精确包含要求时才通过。
3. GitHub scope 使用完整字符串，例如 `check_auth:repo_read:target_bound`；不同 scope 不能前缀匹配或相互替代。
4. JSON 报告新增稳定 `schemaVersion="1"`、`target.requiredOperations` 和 `operationRequirements`。
5. strict 模式在缺平台、平台未就绪、证据过期、操作不匹配或参数畸形时非零退出。
6. watcher 的作用域指纹包含操作要求，操作要求缺失会形成失败关闭信号，不复用其他操作的基线。
7. 跨项目示例改为从任意项目使用 `npm.cmd --prefix $env:AI_LINK_HOME` 调用 AI Link，并使用 `<approved-auth-hub-url>` 占位符。
8. 删除旧交接中把 `voice.xiao-qi-ai.com` 作为 Auth Hub 的错误配置。
9. 未解决的 `action_required` / `approval_required` 任务不再被较新的其他 operation、scope 或目标 probe 按时间掩盖；任务必须自身重试或结算后才会离开人工事项列表。
10. `approval_expired` 与未知人工错误码都失败关闭并进入 `nextActions`，不再被静默丢弃。
11. Auth Hub 每类人工事项读取上限采用 `limit + 1` 检测；一旦截断，任何平台都不得保持 `ready`，客户端返回 `action_task_list_truncated`，禁止依赖项目继续真实平台自动化。
12. watcher 将 `approval` 排在普通 `manual` 事项之上，普通人工事项升级为审批时会触发恶化提醒。
13. 服务端 Auth Status 合同升级为 `schemaVersion="2"`；strict、watch 和 operation gate 必须同时确认人工事项覆盖完整，旧版、缺字段、矛盾状态和截断都失败关闭。
14. 平台主状态与人工事项分开聚合：blocked probe 可以保持最严格平台结论，但不会隐藏同平台其他续登、凭据或审批错误码；每类待办继续独立出现在 `nextActions`。
15. watcher 快照升级为 schema 3，按 `platform + kind + operation` 区分信号；同一平台的人工动作和多个 operation 门禁可以同时存在，不再互相覆盖。
16. `--require-operation` 尾部缺值会明确返回 `invalid_operation_requirement`，不再被参数扫描静默忽略。

## 价值

- Hermes、ParentingGame 和后续项目可以只在真正需要外部平台能力时做一次精确检查，不必每个普通任务查询 AI Link。
- 一个平台或 scope 的成功不再扩大为整个平台可用，降低误调用真实账号、配额和受控接口的风险。
- 外部项目获得稳定、机器可读且失败关闭的消费合同，不需要自行解析 Auth Hub 原始响应。

## 边界

- 本轮不创建 probe，不运行真实 GitHub、小红书或公众号调用。
- 不保存或显示 token、Cookie、Profile、二维码、账号、目标仓库名或原始平台响应。
- GitHub probe 目标仍由服务端 HMAC 隔离，消费端不能读取目标摘要。当前精确门禁只证明 operation + scope 存在某个 `target_bound` 证据，**尚不能证明该证据就是调用方当前仓库**；目标级服务端核验仍是下一轮 P0，不得把本轮结果扩大解释为任意同 scope 仓库可用。
- 真实操作证据仍需账号负责人按平台、scope、目标、频率和停止条件单独批准。

## 验收

- 精确操作存在：strict 退出 0。
- 同平台错误 GitHub scope：strict 非零，并返回 `required_operation_unverified`。
- 畸形 operation requirement：strict 非零，不发起错误目标调用。
- 较新的其他 scope probe 不隐藏未解决人工任务；审批过期和未知错误码都形成公开人工事项。
- 人工事项超过读取上限时所有平台失败关闭，客户端报告监控覆盖不完整。
- 50 条人工事项保持完整覆盖，第 51 条触发路由级截断；旧版、缺字段或自相矛盾的覆盖响应同样失败关闭。
- blocked probe 与多个未解决人工错误码同时存在时，平台保持 blocked，全部待办仍可见。
- 同平台两个 operation 门禁与一个人工动作同时存在时，watcher 保留 3 个独立信号。
- watcher schema 2 私有快照不会静默复用，需由维护者确认后重建 schema 3 基线。
- 交接文档不再把内容站域名配置为 Auth Hub。
- 定向回归：53/53 通过。
- `npm test`：301/301 通过（核心 74，Auth Hub 227）。
- `npm run check`：通过。
- `npm run security:scan`：396 个公开文件通过。
- `tools/check-governance.ps1`：通过。
- `npm run verify:fresh`：提交态独立复核通过，用时约 503 秒；全新克隆、`npm ci`、完整测试、公开命令、打包安装烟测和安全扫描均成功。首次未提交运行因外层 480 秒预算终止，不作为通过证据。
- GitHub CI 和知识库镜像按项目收尾流程继续执行。

## 后续状态

2026-07-13 的下一轮精确目标核验已关闭本台账第 42 行记录的限制。当前仓库级放行不再只依赖公开 `target_bound` 字符串，而是要求客户端通过私有环境变量提供当前目标，并由 `POST /api/auth-status/verify-targets` 在服务端比较完整 HMAC 与新鲜 probe 绑定。实现、隐私边界和验收证据见 `session-2026-07-13-auth-status-exact-target-verification.md`；本节不改写上一轮当时的真实完成状态。
