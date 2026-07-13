# 2026-07-12 Auth Hub 状态只读客户端交接

## 背景

PR #16 合并后，Auth Hub 的 `/api/auth-status` 已能返回 `nextActions`，但 ParentingGame、Hermes Agent 等项目还需要一个低成本、可复用的消费入口，避免每个项目自己写请求、字段过滤和脱敏判断。

## 本次增量

- 新增 `tools/show-auth-status-next-actions.js`。
- 新增命令：
  - `npm run auth-hub:status`
  - `npm run auth-hub:status:json`
  - `npm run auth-hub:status:strict`
- 命令读取：
  - `AI_LINK_BASE_URL`
  - `AI_LINK_CODEX_TOKEN` 或 `AI_LINK_ADMIN_TOKEN`
  - 可选 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`
- 命令只调用 `GET /api/auth-status`，输出公开安全的 `summary`、`authStatus.items` 和 `nextActions`。

## 给其他项目的配置口径

其他项目如果需要知道是否能继续自动化，只需要配置：

```powershell
$env:AI_LINK_HOME="D:\codex_workplace\ai_Link"
$env:AI_LINK_BASE_URL="<approved-auth-hub-url>"
$env:AI_LINK_CODEX_TOKEN="<read-only-codex-token>"
npm.cmd --prefix $env:AI_LINK_HOME run auth-hub:status:strict -- --require-operation "github=check_auth:repo_read:target_bound"
```

远程 hostname 还必须显式加入当前进程的 `AI_LINK_AUTH_HUB_ALLOWED_HOSTS`。`voice.xiao-qi-ai.com` 是内容站，不是 Auth Hub，不能作为该客户端目标。

处理规则：

- `nextActions` 为空：相关平台授权状态无需人工处理，项目可以继续正常自动化。
- `severity=manual`：暂停相关平台任务，找 `owner` 对应负责人处理，处理后按 `retryAfterAction` 决定是否 retry。
- `severity=approval`：需要维护者先在 Auth Hub 审批，不能由业务项目直接触发本机交互登录。
- `severity=blocked`：先修 AI Link/平台授权/连接器合同，不要在业务项目里盲目重试。
- 平台级 `ready` 不足以放行；必须同时确认所需 `operationRequirements[].status=verified`。
- `action_tasks_truncated=true` 时暂停所有真实平台自动化；先恢复 Auth Hub 的完整人工事项覆盖。
- GitHub `target_bound` 当前只证明某个服务端目标已绑定，不能证明是调用方当前仓库；仓库级放行等待后续服务端目标核验。

## 安全边界

- 不输出 API token、Cloudflare service token、Cookie、Profile、二维码、截图、账号详情、原始平台响应或 `runtime/private` 路径。
- 不新增真实平台调用。
- 不改变 Auth Hub 审批门。
- 这是跨项目状态消费入口，不是小红书、公众号或 GitHub 的真实 connector 实现。

## 2026-07-13 当前口径补充

本节取代上文关于“命令只调用 GET”和“仓库级核验等待后续实现”的当前使用口径，但保留原文作为历史记录。

GitHub 仓库级自动放行现在必须同时声明 operation、scope 和精确目标：

```powershell
$env:AI_LINK_GITHUB_REPOSITORY="<owner>/<repo>"
npm.cmd --prefix $env:AI_LINK_HOME run auth-hub:status:strict -- --require-operation "github=check_auth:repo_read:target_bound" --github-target-env AI_LINK_GITHUB_REPOSITORY
```

- 命令总是先读取 `GET /api/auth-status`；只有通用状态具备候选证据时，才调用 `POST /api/auth-status/verify-targets` 做服务端精确目标比较。
- 精确目标 POST 同时要求 `connectors:read` 与独立 `connectors:verify-target`；普通状态查看 token 不应获得后一个 scope。
- 当前 GET 只发布 `check_auth:<scope>:target_verification_required:v1` 候选标记，不发布会被旧客户端误判为已经精确通过的 `target_bound`。
- `--github-target-env` 接收环境变量名，不能直接接收 `owner/repo`。原始目标只短暂存在于调用进程环境和认证 POST 请求体，不进入 URL、API 响应、CLI 报告、watcher 快照或服务端 probe 证据存储。
- `target_bound` 仍不能单独放行；只有对应 `operationRequirements[].status=verified` 才表示 operation、scope 和当前目标均匹配。
- 两个状态接口都不创建 probe、不访问 GitHub、不改变审批门；缺目标、错误目标、接口过旧或合同异常全部失败关闭。
