# Auth Hub 凭据与数据生命周期

日期：2026-07-13

状态：代码、公开文档与本地完整回归已完成；等待 GitHub 临时 Postgres 集成检查和草稿 PR 复核。

## 背景

Auth Hub 正从本地控制台推进到远程状态中枢。长期运行前需要关闭两类风险：配置 token 轮换或删除后旧凭据仍有效，以及审批、artifact、审计、心跳和 probe 数据无限累积。

本轮只修改公开仓内的生命周期合同、CLI、部署配置、测试和中文手册；不连接生产数据库，不读取真实 token，不创建 Render Cron，不删除任务或平台账号。

## 完成内容

- 新增配置托管 token 的原子对账合同，托管名称为 `admin`、`executor`、`codex`。
- 同名换 hash 视为显式轮换；旧 hash 立即失效。
- 配置中缺失的托管名称会被撤销，不再依赖数据库残留凭据。
- 同名同 hash 重启保留现有撤销与到期状态，通用 upsert 旁路也不会复活凭据。
- MemoryStore 与 PostgresStore 使用一致语义；Postgres 使用事务和 advisory lock。
- 新审批默认带到期时间；过期后拒绝批准，并把关联任务转为 `action_required`。
- 新增 `auth-hub:retention` / `auth-hub:retention:json`，默认使用只读 dry-run。
- apply 必须显式提供 `--apply --confirm-backup`，每类单批默认最多 500 行。
- apply 在一个 Postgres 事务内完成；任一步失败整批回滚，并写入脱敏维护审计。
- 清理范围只包括过期审批状态迁移、终态任务到期 artifact、过期心跳、过期 probe 和符合条件的旧审计。
- 任务、API token、平台账号、活跃任务数据和私有登录态均受保护。
- 新增中文手册 `docs/20-architecture/auth-hub-data-lifecycle.md`，同步 README、用户手册、部署清单、Render 蓝图和 Changelog。

## 已有验证

- token 生命周期定向测试：8/8 通过。
- retention 生命周期定向测试：12/12 通过。
- 覆盖 dry-run 零写入、备份确认门禁、单批上限、活跃任务保护、审批到期、同 hash 不复活和事务回滚。
- Auth Hub JavaScript 全量测试：194 项通过，0 失败；真实 Postgres suite 在本机因 Docker 服务未运行而跳过。
- TypeScript/CLI 测试：74 项通过，0 失败。
- 类型检查、打包内容 36/36、安装 smoke 16/16、安全扫描和生产依赖审计均通过。
- 部署蓝图检查通过；所有生命周期环境变量均由 `render.yaml` 明确引用。
- 独立安全/数据/测试审查完成；Coze Code 复核也确认 token 复活和未接线保留期是优先风险。

## 明确边界

- 本轮不物理删除任务，因为保留中的审计需要稳定任务关联。
- 本轮不清理 API token 行；配置删除仅做撤销并保留审计证据。
- 本轮不创建自动调度。生产自动清理需要单独决策频率、维护窗口、告警和恢复责任人。
- 首次生产 apply 前必须验证备份或 PITR 恢复点，并由数据库/部署负责人批准。
- 事务提交前可回滚；提交后恢复依赖备份或 PITR。
- 当前机器安装了 Docker CLI，但 Docker Desktop 服务未运行；不得用生产连接串替代真实测试数据库验证。

## 后续门禁

1. 完成治理与知识库镜像验证。
2. GitHub CI 使用专用 `ai_link_test` Postgres 16 服务验证 DDL、锁、事务、批量删除和失败回滚；未通过前 PR 保持草稿。
3. 草稿 PR 合并后，再单独决定是否创建定时清理任务。
4. 远程 Auth Hub 首次生产 apply 仍需人工确认，不随部署自动执行。
