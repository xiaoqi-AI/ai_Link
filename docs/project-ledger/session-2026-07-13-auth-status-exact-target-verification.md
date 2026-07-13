# Auth Hub GitHub 精确目标核验

日期：2026-07-13

状态：已完成。实现、定向测试、全量本地回归、安全扫描、治理检查、fresh-clone 复核、GitHub CI、合并和知识库镜像验证均已通过。未调用真实 GitHub，未读取凭据，未创建远程资源。

## 背景

上一轮 operation gate 已能区分 GitHub `repo_read`、`actions_read` 和 `pull_request_read`，但公开 `check_auth:<scope>:target_bound` 只能证明某个不公开目标存在成功证据，不能证明该目标就是 ParentingGame、Hermes 或其他调用方当前仓库。若直接据此自动放行，同 scope 的仓库 A 证据可能被仓库 B 误用。

本轮目标是关闭这项扩大解释风险，同时继续满足公开仓脱敏边界：调用方提供当前 owner/repo，Auth Hub 仅在服务端比较，不把目标或摘要带回报告和 watcher 快照。

## 本轮完成

1. 新增认证只读接口 `POST /api/auth-status/verify-targets`，同时要求 `connectors:read` 与独立 `connectors:verify-target`；普通状态 token 不具备目标枚举权限。
2. 请求合同固定为 `schemaVersion="1"`，最多 10 项要求且同一 operation/scope 只能出现一次；当前只接受 GitHub `check_auth`、三个只读 scope 和严格 owner/repo。
3. 服务端复用 probe 结算时的目标规范化和 HMAC 生成函数，使用完整定长摘要比较，不接受前缀。
4. 只有同一受信执行器/session、当前 connector 为 available/private、精确 operation/scope、最新且未过期证据、目标 HMAC 和成功结论全部匹配时才返回 `verified`。
5. 缺失、过期、错误目标、错误 scope、session 重启和最新失败证据统一返回通用 `unverified`，不暴露哪一层不匹配。
6. 响应只含版本、平台、公开 operation、状态和通用原因，并设置 `Cache-Control: no-store`；不返回 owner/repo、HMAC、任务、lease、executor/session、时间或原始证据。
7. GET 状态改为发布 `check_auth:<scope>:target_verification_required:v1` 候选标记，不再发布旧客户端会直接信任的 `target_bound`；新旧客户端/服务端交叉升级均失败关闭。
8. `auth-hub:status` 新增 `--github-target-env <ENV_NAME>`。目标值只能从环境变量读取，不进入命令行参数、报告、URL、日志、blocker、signal 或快照。
9. strict 与 watch 先检查完整 Auth Status，再按需调用精确目标接口；旧服务端、畸形响应、缺配置和传输错误全部失败关闭。
10. watcher 作用域包含使用当前受限 token 加钥计算的规范化目标摘要；大小写等价目标复用基线，不同仓库不复用基线，目标值本身不落盘。

## 价值

- ParentingGame、Hermes 和其他项目可以在真正需要 GitHub 只读能力时，验证“正确 operation + 正确 scope + 当前仓库”，而不是信任平台级 ready 或通用 target-bound 字符串。
- 目标比较集中在 Auth Hub，业务项目无需接触 probe 表、HMAC secret 或内部执行器标识。
- 普通开发任务仍不查询 Auth Hub；只有命中外部平台能力触发条件时才运行，避免冷启动 token 和网络浪费。

## 安全边界

- 本轮不创建 probe、不触发真实 GitHub 请求、不修改仓库权限、不合并业务 PR。
- 原始目标仅短暂存在于调用进程环境变量和认证 POST 请求体中；不进入 URL、API 响应、CLI 输出、watcher 快照或服务端 probe 证据存储。
- 精确核验只证明已经存在的新鲜只读证据匹配当前目标；它不授予写权限，不替代登录、审批、发布或费用门禁。
- 核验接口使用独立 `connectors:verify-target` scope、既有 Bearer/Cloudflare 边界和严格小请求合同；该 scope 只发给可信门禁客户端。若远程服务未来横向扩容或面向更多调用方，应继续建设每项目目标绑定和共享限流，不应把通用状态 token 升级为目标枚举凭据。

## 失败关闭矩阵

| 场景 | 结果 |
| --- | --- |
| 正确目标、scope、新鲜受信证据 | `verified` |
| 错误目标或错误 scope | `target_unverified` |
| 目标环境变量缺失或畸形 | `target_missing` / `target_invalid` |
| 服务端过旧、不可达或响应合同异常 | `target_coverage_unverified` |
| 最新证据 blocked/needs-action、TTL 到期或 executor session 重启 | `target_unverified` |
| watcher 切换到不同目标并复用旧状态文件 | `state_scope_mismatch`，不推进基线 |

## 验收

- 正确目标通过；错误仓库、错误 scope、最新失败证据、TTL 边界和 session 重启均失败关闭。
- 请求未知字段、重复 operation/scope 和畸形目标返回 `400`；缺 `connectors:read` 或 `connectors:verify-target` 返回 `403`。
- 当前 connector 失配时，即使存在旧成功 probe，也不得发布候选 operation 或精确 `verified`。
- 畸形 JSON 在鉴权前由通用解析器拒绝，但日志只记录稳定错误码与状态，不记录请求体、目标或异常对象。
- 响应和客户端输出不包含目标值或内部 HMAC；响应带 `Cache-Control: no-store`。
- 客户端对旧端点 `404`、HTTP 200 畸形响应和多余私有字段失败关闭，且不打印原始响应。
- watcher 验证目标大小写规范化与跨目标作用域隔离。
- 定向测试：58/58 通过，包含第一轮安全复核发现的 connector 失配、解析日志、双向升级、批量关联、独立 scope 和 keyed-HMAC 场景。
- `npm test`：306/306 通过（核心 74，Auth Hub 232）。
- `npm run check`：通过。
- `npm run security:scan`：397 个公开文件通过。
- `tools/check-governance.ps1`：通过。
- `npm run verify:fresh`：通过；临时干净克隆完成安装、构建、测试与安全扫描。
- GitHub PR #36：`Verify` 与 `Postgres integration` 通过后完成 squash 合并，未绕过分支保护。
- 知识库镜像：同步并通过一致性验证。
