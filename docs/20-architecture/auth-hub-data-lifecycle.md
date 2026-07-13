# Auth Hub 凭据与数据生命周期手册

## 1. 目的

Auth Hub 远程运行后会长期保存任务、审批、审计、执行器心跳和连接器探测证据。本手册定义两条运行边界：

1. 配置托管的 API token 必须能安全轮换和撤销，服务重启不能复活旧凭据。
2. 低关联运行数据必须按保留期有界清理，但不得误删任务、平台账号、API token 或本机私有登录态。

本能力服务于 AI Link 自身运维。ParentingGame、Hermes Agent 等使用方只消费 Auth Hub 的脱敏状态和结果，不需要持有数据库凭据或执行清理。

## 2. API Token 对账规则

Auth Hub 启动时把 `admin`、`executor`、`codex` 视为配置托管名称，并在一次原子操作中对账：

- 同名、不同 hash：视为显式轮换。新 token 生效，旧 hash 立即失效。
- 同名、相同 hash：只允许更新 scopes 和 executor 绑定；已有撤销和到期状态必须保留。
- 托管名称从配置消失：保留记录用于审计，同时设置撤销时间。
- 已撤销 token 重新以同一 hash 出现：仍保持撤销；必须换新 token 才能重新启用。
- 重复名称、重复 hash 或 hash 已属于其他名称：整次同步失败并回滚。
- 非配置托管的人工 token 不受启动对账影响。

原始 token 和 hash 不进入日志、报告、PR、知识库或审计详情。

## 3. 保留策略

| 数据 | 默认策略 | 处理方式 |
| --- | --- | --- |
| 待审批记录 | 7 天 | 标记为 `expired`，关联的 `approval_required` 任务转为 `action_required` |
| 终态任务 artifact | 7 天 | 到期后物理删除；显式 `retentionUntil` 优先 |
| 普通审计 | 180 天 | 仅删除无任务或关联终态任务的旧事件 |
| 清理维护审计 | 365 天 | 使用更长保留期 |
| 执行器心跳 | TTL 过期后再保留 24 小时 | 物理删除 |
| 连接器 probe | TTL 过期后再保留 7 天 | 物理删除 |

单次每类最多处理 500 行，最多可配置为 1000 行。还有候选时报告 `hasMore=true`，一次命令不会无限循环。

审批决定还会校验关联任务仍为 `approval_required`。如果任务已经完成、取消或进入其他状态，Hub 返回 `approval_context_stale`，不会重新排队任务，也不会改变旧审批。

永不由该命令自动删除：

- 任何任务记录
- API token 记录
- 平台账号
- 活跃任务的数据
- 未过期数据
- Cookie、浏览器 Profile、OAuth refresh token、二维码、截图或 `runtime/private/` 内容

## 4. 命令

只读预览：

```powershell
npm run auth-hub:retention
npm run auth-hub:retention:json
```

预览模式使用只读事务，只输出策略、截止时间、候选数量和 `hasMore`，不输出记录 ID、任务输入、账号信息或数据库地址。

执行一个有界批次：

```powershell
npm run auth-hub:retention -- --apply --confirm-backup --actor maintenance:operator
```

`--confirm-backup` 表示维护者已经验证当前数据库存在可恢复的备份或 PITR 恢复点。它不是自动备份功能。没有该确认时，apply 会失败关闭。

可选限制：

```powershell
npm run auth-hub:retention -- --max-rows 100
```

## 5. 生产执行顺序

1. 确认使用的是 Auth Hub 生产数据库，不在聊天、文档或终端截图中暴露 `DATABASE_URL`。
2. 在 Render 或数据库控制台确认备份/PITR 可用，并记录内部恢复点证据。
3. 先运行 dry-run，检查每类候选数量与截止时间。
4. 数量异常、`hasMore` 超出预期或活跃任务出现候选迹象时停止，不执行 apply。
5. 人工批准后运行一次 apply；每次只处理一个有界批次。
6. 检查 `maintenance.retention_applied` 脱敏审计和 Auth Hub 关键流程。
7. 需要继续处理时重新 dry-run，不自动循环。

事务提交前可以整体回滚；提交后的物理删除只能依赖已验证备份或 PITR 恢复。

## 6. 当前门禁

- 本轮没有创建 Render Cron Job，也不会自动连接生产数据库。
- 自动定时清理必须单独决策执行频率、维护窗口、告警和恢复责任人。
- 合并前要求 MemoryStore 契约测试、Postgres 事务测试和完整回归通过。
- 首次生产 apply 必须由数据库/部署负责人独立批准。
- 真实 Postgres 集成测试只能使用专用测试数据库；禁止使用生产连接串。

## 7. 配置项

| 环境变量 | 默认值 | 范围 |
| --- | ---: | ---: |
| `AI_LINK_ARTIFACT_RETENTION_DAYS` | 7 | 1-365 天 |
| `AI_LINK_APPROVAL_RETENTION_DAYS` | 7 | 1-90 天 |
| `AI_LINK_AUDIT_RETENTION_DAYS` | 180 | 30-3650 天 |
| `AI_LINK_MAINTENANCE_AUDIT_RETENTION_DAYS` | 365 | 90-3650 天 |
| `AI_LINK_HEARTBEAT_RETENTION_GRACE_HOURS` | 24 | 1-168 小时 |
| `AI_LINK_PROBE_RETENTION_GRACE_DAYS` | 7 | 1-90 天 |
| `AI_LINK_RETENTION_MAX_ROWS_PER_TABLE` | 500 | 1-1000 行 |

这些配置不是密钥，可以进入部署蓝图；`DATABASE_URL` 和所有 token 仍必须使用 Secret 管理。
