# Connector Contracts

AI Link 的连接器合同用于描述平台侧能力边界。它和 provider 不同：

- provider 负责调用模型或 Agent，例如 Grok、Kimi、DeepSeek、Coze。
- connector 负责连接外部平台能力，例如内容平台、检测平台或 Search Console 运营数据源。
- Codex 仍负责最终的工程动作、验证、安全判断和 Git 收尾。

## Public MVP Status

公开仓当前只启用安全 mock 连接器：

| Platform | Status | Capabilities |
| --- | --- | --- |
| `wechat_official` | available | `check_health`, `read_content`, `create_draft`, `publish`, `metrics` |
| `zhuque_ai` | available | `detect` |
| `google_search_console` | available | `list_sites`, `inspect_url`, `list_sitemaps`, `submit_sitemap`, `check_public_crawlability`, `generate_status_report` |
| `github` | available | `check_auth` |
| `douyin` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |
| `xiaohongshu` | reserved | `check_session`, `begin_login`, `complete_login`, `logout`, `read_content` |
| `zhihu` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |
| `toutiao` | reserved | `read_content`, `create_draft`, `publish`, `metrics` |

`reserved` 表示公开仓只保留合同位置，不包含真实登录态、账号、Cookie、浏览器 profile 或平台私有实现。

`google_search_console` 的 `available` 是分层状态：公开站点抓取检查为真实只读能力，Sites / URL Inspection / Sitemaps API 默认是 mock，`submit_sitemap` 默认仅返回人工审批要求。真实 Google OAuth 和 API client 必须从私有运行时注入，详见 `google-search-console-connector.md`。

`github` 的 `available` 当前表示公开 mock 授权健康检查合同已存在。真实 GitHub 凭据、`gh` 登录态、GitHub App token 或 fine-grained PAT 必须从私有运行时注入；公开仓不会保存或读取真实 token。该连接器只用于判断 GitHub 授权是否需要维护者处理，不替代 provider-live workflow、GitHub App、仓库保护或 GitHub UI 设置。

## Read-only Status API

授权中枢提供只读状态接口：

```text
GET /api/connectors
Authorization: Bearer <token with connectors:read>
```

返回内容只包含平台、状态、模式、能力、方法名、是否必备和合同问题，不返回密钥、Cookie、二维码、截图、登录态、原始平台内容或本机路径。

默认开发配置中：

- `admin` token 拥有 `connectors:read`。
- `codex` token 默认拥有 `connectors:read`。
- `executor` token 不拥有该权限。

授权/登录状态摘要使用同一个只读权限：

```text
GET /api/auth-status
Authorization: Bearer <token with connectors:read>
```

该接口在 `GET /api/connectors` 的平台能力契约基础上，额外合并当前 `action_required` 与 `approval_required` 任务，生成公开安全的 `authStatus`：

- `summary.ready`：无需人工处理的平台数量。
- `summary.needs_action`：已有登录、验证码、凭据、交互登录审批或连接器维护任务的平台数量。
- `summary.reserved`：仅预留合同位的平台数量。
- `summary.blocked`：契约缺失或配置异常的平台数量。
- `summary.next_actions`：当前需要项目负责人或维护者跟进的行动数量。
- `items[].action`：面向维护者的中文处理建议。
- `items[].relatedTaskIds`：关联任务 ID，便于进入 Auth Hub 控制台处理和 retry。
- `nextActions[]`：面向项目负责人和外部项目的行动清单。每条只包含 `platform`、`reason`、`title`、`owner`、`severity`、`runbook`、`relatedTaskIds` 和 `retryAfterAction`，不包含真实登录态。

`nextActions[].owner` 的稳定取值包括：

- `account_owner`：需要账号负责人在受信任本机登录、续登或完成人机验证。
- `maintainer`：需要 AI Link 维护者审批或判断是否继续。
- `secret_owner`：需要密钥负责人补齐或轮换凭据。
- `platform_admin`：需要平台管理员配置 IP 白名单等平台设置。
- `connector_maintainer`：需要修复私有连接器合同或脱敏输出。

`nextActions[].severity` 的稳定取值包括 `approval`、`manual` 和 `blocked`。外部项目只应把这些字段作为暂停、提醒和人工门禁信号；不得据此读取 Cookie、Profile、token、二维码、截图、账号详情、原始响应或本机私有路径。

外部项目或本地维护者可以用只读命令消费同一合同：

```powershell
$env:AI_LINK_BASE_URL="https://auth.xiao-qi-ai.com" # 建议候选，部署前确认
$env:AI_LINK_CODEX_TOKEN="<read-only-codex-token>"
npm run auth-hub:status
npm run auth-hub:status:json
```

该命令总是先读取 `GET /api/auth-status`，并把返回结果重新收敛为公开安全的 `summary`、`authStatus.items` 和 `nextActions`；只有显式要求 GitHub 精确目标时才按需调用 `POST /api/auth-status/verify-targets`。如果远程 Auth Hub 使用 Cloudflare Access Service Auth，可以在当前终端临时设置 `CF_ACCESS_CLIENT_ID` 与 `CF_ACCESS_CLIENT_SECRET`；命令只报告是否可达和行动清单，不打印这些值、目标值或原始响应。

`authStatus` 只允许使用平台名、公开错误码和任务 ID 推导，不得包含 Cookie、Profile、token、账号详情、二维码、截图、原始响应或本机私有路径。真实平台 connector 如果发现登录过期、验证码、IP 白名单、凭据错误或连接器合同异常，应把问题映射为稳定公开错误码，并通过 `needs_action` / `action_required` 回传。需要打开本机浏览器或进入扫码/验证码的 `begin_login` 会先映射为 `interactive_approval_required`，并通过 `approval_required` 进入人工审批。

## Contract Rules

每个真实 connector 上线前至少需要满足：

- 实现对应平台的全部必备方法。
- 失败时把登录过期、验证码、限流、人工验证等情况映射为 `needs_action` / `action_required`。
- 不把原始 HTML、Cookie、token、账号详情或截图写入 API 响应、Git、日志或知识库。
- 补充合同测试、失败场景测试和敏感信息扫描。
- 对真实外部写操作声明 capability mode，并保留显式人工审批门。

真实平台 connector 应放在私有仓、本机私有配置或 `runtime/private/` 治理边界内；公开仓只保留合同、mock、状态页和安全测试。

## Platform Authorization Result

`platform_auth_collect` 当前只接受以下最小操作：

| Platform | Operation | Connector method | Boundary |
| --- | --- | --- | --- |
| `xiaohongshu` | `check_session` | `checkSession` | 只读真实搜索验证 |
| `xiaohongshu` | `begin_login` | `beginLogin` | 本机可见浏览器，人工扫码/验证 |
| `xiaohongshu` | `search_content` | `readContent` | `latest`、1 至 4 条、`read_only` |
| `wechat_official` | `check_health` | `checkHealth` | 官方 API 只读健康检查 |
| `github` | `check_auth` | `checkAuth` | 目标仓库必填；`repo_read` / `actions_read` / `pull_request_read` 分别探测 Contents、Actions、Pull requests 只读端点 |

连接器结果固定为：

```json
{
  "schema_version": "1",
  "platform": "xiaohongshu",
  "operation": "check_session",
  "status": "ready",
  "session": {
    "state": "valid",
    "checked_at": "2026-07-11T08:00:00.000Z"
  },
  "items": [],
  "action_required": null,
  "diagnostics": {
    "item_count": 0
  }
}
```

`session.state` 只能是 `not_required`、`valid`、`missing`、`expired`、`verification_required` 或 `blocked`。`status` 只能是 `ready`、`needs_action` 或 `blocked`。

`begin_login` 是 interactive 方法。执行器不会在普通任务、定时任务或未审批 retry 中直接调用它；首次运行会返回 `approval_required/interactive_approval_required`，只有审批通过并把任务推进到 `platform_interactive_login` 步骤后，才允许调用受信任私有连接器。

公开合同使用 allowlist 重建结果：只有 `xiaohongshu/search_content` 允许非空 `items`，并且只接受 `xiaohongshu.com` 的具体笔记路径，移除查询参数和 fragment；每条素材必须声明 `source_reachability.status=verified` 和 `acquisition_provider=ai_link_xhs_readonly`。`check_session`、`begin_login`、`wechat_official/check_health`、`github/check_auth` 或任何其他操作返回非空条目时，合同验证失败关闭。额外字段不会进入 Auth Hub。

## Executor Capability Evidence

连接器合同状态不等于运行时可用。Auth Hub 使用执行器能力心跳补充一层公开安全证据：

- 服务端静态 registry 继续决定公开平台合同和 baseline，响应位于 `GET /api/connectors` 的顶层 `connectors`。
- 本地执行器从已加载 registry 构造严格白名单快照，通过 `POST /api/executor/heartbeat` 上报；它不会调用 `checkSession`、`checkHealth`、`checkAuth`、`readContent` 或写操作。
- 服务端设置 `lastSeenAt` 与 `expiresAt`，只保存每个 executor id 的最新记录；过期记录只显示为 `stale`，不能覆盖服务端 baseline。
- 合并后的公开视图位于 `executorRuntime.connectors`，并明确给出 `evidence.contract`、`evidence.executor`、`evidence.probe`、`operationalStatus` 和 `canRunReal`。
- 没有显式探测结果时，`evidence.probe=not_run`、`operationalStatus=unverified`、`canRunReal=false`；新鲜成功证据只把对应操作加入 `verifiedOperations`。

心跳允许保留 `live-read-only`、`approval-required-local`、`mock` 等 capability mode，但拒绝未知顶层字段、未知平台、重复能力、矛盾状态和越界 issue code。禁止上报 hostname、用户名、私有模块路径、凭据存在性、Cookie、token、Profile、账号详情、原始响应或 connector 异常栈。heartbeat scope 与 lease/result scope 分开；心跳失败是 best-effort，不阻塞执行器继续向兼容的旧 Hub 领取任务。

生产环境通过 `AI_LINK_EXECUTOR_ID` 把 executor token 绑定到固定执行器身份；本地执行器每次启动生成新的进程 session id。所有任务结果都必须由领取任务的同一身份/session 携带当前一次性 `leaseId`，并在租约有效期内提交一次。Postgres 使用条件更新把任务终态、artifact、审批和审计写入同一事务；未领取、错误绑定、重复提交、终态改写或旧租约返回冲突。显式 probe 还只会租给同一在线 session 且报告 private capability 的执行器，并把最新证据纳入同一事务。

## Explicit Connector Probe Evidence

只有管理调用方同时具有 `tasks:create` / `tasks:approve`，并且任务明确带有以下选项时，结果才可能升级为 probe evidence：

```json
{
  "options": {
    "evidenceIntent": "connector_probe"
  }
}
```

首批 allowlist：

| Platform | Operation | Verified capability |
| --- | --- | --- |
| `xiaohongshu` | `check_session` | `check_session` |
| `wechat_official` | `check_health` | `check_health` |
| `github` | `check_auth` | `check_auth:<scope>:target_verification_required:v1`（公开候选；精确通过仍需 POST） |

`begin_login`、`search_content`、普通平台任务、mock 心跳和读取状态页不会生成证据。probe 领取和结算必须同时满足：

1. token 绑定的 executor id 与请求、租约一致。
2. 进程 session 与当前新鲜 trusted heartbeat 一致。
3. heartbeat 中目标 connector 为 `private`，目标 capability 可用且不是 `mock/reserved`。
4. 任务仍为 `running`，一次性 `leaseId` 与 heartbeat revision 一致且尚未过期。
5. Hub 依据任务原始 platform/operation 重新调用公开结果 normalizer，`items` 必须为空，外层和内层状态必须匹配。
6. GitHub `check_auth` 必须携带批准的 `repo_read`、`actions_read` 或 `pull_request_read` scope，并把规范化 owner/repo 绑定为服务端 HMAC 摘要；不同 scope 或目标的证据不能互用。

服务端只保留每个 executor + platform + operation + qualifier + subject 的最新证据；非 GitHub 操作的 qualifier/subject 为空，GitHub qualifier 为 scope、subject 为目标 HMAC 摘要。较旧接收时间不能覆盖较新记录。最新 `needs_action` / `blocked` 会立即覆盖同一限定项的旧成功，证据过期后不会回退到更旧成功。客户端 `session.checked_at` 不参与证据时间计算，`checkedAt` 与 `expiresAt` 只由 Hub 服务端生成。

公开 API 仅返回操作、公开 qualifier、`subjectBound`、结论、公开问题码、任务 ID 和服务端时间；不返回目标 HMAC、`leaseId`、executor session、heartbeat revision、原始结果、diagnostics、账号/仓库详情、路径或私有响应。`canRunReal=true` 只表示当前存在可继续核验的只读健康证据；GitHub `verifiedOperations` 只发布 scope 与 `target_verification_required:v1` 候选标记，故意不发布旧客户端会直接信任的 `target_bound`。不得据此推导目标已匹配、整个平台、写权限或发布能力。

`target_verification_required:v1` 是服务端内部候选标记，不能作为调用方的 `--require-operation`；客户端会把这种输入判为 `invalid_operation_requirement`。调用方仍应要求 `check_auth:<scope>:target_bound`，由客户端在候选状态后继续执行精确目标 POST。

### Exact Target Verification

公开 `target_verification_required:v1` 只说明存在可继续核验的目标绑定证据。依赖项目需要仓库级放行时，必须以 `target_bound` 作为客户端要求并使用只读精确核验接口：

```http
POST /api/auth-status/verify-targets
Authorization: Bearer <token with connectors:read and connectors:verify-target>
Content-Type: application/json
```

```json
{
  "schemaVersion": "1",
  "requirements": [
    {
      "platform": "github",
      "operation": "check_auth",
      "qualifier": "repo_read",
      "target": { "owner": "<owner>", "repo": "<repo>" }
    }
  ]
}
```

请求是严格版本化合同：当前只接受 GitHub `check_auth`、三个只读 scope 和最多 10 项要求，同一 operation/scope 在一批中只能出现一次；未知字段、重复 operation/scope 或畸形 owner/repo 直接返回 `400`。服务端以同一规范化函数和当前 session secret 重建目标 HMAC，再与同一受信执行器/session、当前 available/private connector、精确 scope、最新且未过期的 probe subject 做完整定长比较。只有全部匹配且最新结论为成功时才返回 `status=verified`；其余可解析请求统一返回 `status=unverified` 与通用原因，不泄露哪一层不匹配。

响应只包含合同版本、平台、公开 operation、`verified` / `unverified` 和通用原因；不回显 owner、repo、HMAC、任务 ID、lease、executor/session、证据时间或原始响应，并设置 `Cache-Control: no-store`。独立 `connectors:verify-target` scope 只授予可信项目门禁 token，不授予普通状态查看者。该接口不写审计、不创建任务、不执行 probe、不访问 GitHub。客户端必须先读取完整的 `GET /api/auth-status` 控制面状态，并将目标值放在私有环境变量中；命令行只传 `--github-target-env <ENV_NAME>`，不得直接传目标值。

## Private Connector Injection

本地执行器可以通过 `AI_LINK_PRIVATE_CONNECTOR_MODULE` 加载受信任的私有模块：

```powershell
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/platform-connectors.mjs"
npm run auth-hub:executor:start
```

私有模块必须位于当前仓库真实路径下的 `runtime/private/`，扩展名只能是 `.js` 或 `.mjs`，并导出异步或同步工厂：

```js
export async function createPrivateConnectors() {
  return {
    xiaohongshu: xiaohongshuReadonlyConnector,
    wechat_official: wechatOfficialApiConnector,
    github: githubAuthHealthConnector
  };
}
```

该模块拥有本机代码执行权，只能配置维护者已审查的文件。模块路径不接受 Auth Hub 任务输入，不能由远端调用方指定。真实代码可以进入私有仓，但 Cookie、Profile、二维码、凭据和原始响应仍不得进入任何 Git 仓库。

三个独立适配器不能通过重复设置同一个环境变量直接共存；后一次赋值会替换前一次。维护者应使用公开组合生成器创建唯一入口：

```powershell
npm run auth-hub:private-bundle:print
npm run auth-hub:private-bundle:new
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/platform-connectors.mjs"
```

默认输入是 `runtime/private/` 下的 GitHub、公众号和小红书适配器，也可以重复使用 `--module` 指定已审查文件。生成阶段验证真实路径、扩展名、文件类型、重复输入和输出边界，但不导入模块、不运行工厂、不读取环境凭据。生成的组合入口在执行器启动时逐个调用工厂，并拒绝非对象导出和重复平台所有权；不允许通过顺序覆盖把一个平台从已审查连接器切换到另一个连接器。每个 import 带生成时的文件修改版本；任一子模块更新后应重新生成组合入口并重启执行器。

小红书真实只读能力可以用公开脚手架接入本机私有桥：

```powershell
npm run auth-hub:xhs-adapter:print
npm run auth-hub:xhs-adapter:new
$env:AI_LINK_XHS_READONLY_BRIDGE="runtime/private/xiaohongshu-readonly-bridge.mjs"
```

适配器和桥都必须位于同一个仓库的 `runtime/private/`，扩展名为 `.js` 或 `.mjs`。适配器通过 `spawn(process.execPath, ...)` 调用桥，固定 `shell=false`，把下列请求作为唯一标准输入：

```json
{
  "schema_version": "1",
  "platform": "xiaohongshu",
  "operation": "search_content",
  "input": {
    "query": "AI Agent",
    "limit": 4
  }
}
```

桥只能输出一个 JSON 对象。`check_session` 和批准后的 `begin_login` 可以返回 `{"ok":true,"schema_version":"1","data":{"authenticated":true}}`；未完成登录则使用 `error.code=not_authenticated`、`session_expired`、`captcha_required` 或 `verification_required`。`search_content` 可以在 `data.items` 或 `data.notes` 返回平台原始条目的有限子集，适配器只读取笔记 ID、标题、摘要和可选公开时间，再重建公开合同。未知错误、非 JSON、过大输出、非零退出且无稳定错误码、越界桥和非法公开结果全部失败关闭；stdout、stderr、异常栈和绝对路径不会进入任务结果。

适配器不会接受远端任务指定桥路径，不会调用 shell，不会把 `xsec_token` 拼回 URL，也不会实现发布、点赞、评论、关注、私信、验证码规避或无人值守登录。桥超时映射为可重试的 `platform_unavailable`，明确限流映射为 `platform_rate_limited`。

GitHub 授权健康检查可以用公开安全脚手架生成本机私有适配器：

```powershell
npm run auth-hub:github-adapter:print
npm run auth-hub:github-adapter:new
$env:GH_TOKEN="<fine-grained-readonly-token-or-session-token>"
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/github-auth-adapter.mjs"
npm run auth-hub:executor:start
```

脚手架只允许输出到 `runtime/private/`，不会保存 token。生成的 `github.checkAuth()` 只读 GitHub API 授权健康状态，并把缺少凭据、无效凭据和限流映射为公开错误码。

公众号官方 API 健康检查也提供独立的公开安全脚手架：

```powershell
npm run auth-hub:wechat-adapter:print
npm run auth-hub:wechat-adapter:new
$env:WECHAT_OFFICIAL_APP_ID="<official-account-app-id>"
$env:WECHAT_OFFICIAL_APP_SECRET="<official-account-app-secret>"
$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="runtime/private/wechat-official-health-adapter.mjs"
npm run auth-hub:executor:start
```

生成的 `wechat_official.checkHealth()` 只向微信官方稳定 access-token 接口发起健康检查。适配器会立即丢弃成功响应中的 access token，不保存或回传 AppID、AppSecret、access token、`errmsg` 或原始响应；只把结果映射为 `ready`、`credential_missing`、`credential_invalid`、`official_api_ip_not_whitelisted`、`official_api_rate_limited` 或 `official_api_unavailable`。当前脚手架只把 `check_health` 标记为 `private`，公众号内容读取、草稿、发布和指标能力继续保持 `mock`，不能据此声称已经接入真实草稿或发布能力。

此边界假设 `runtime/private/` 只允许受信任的本机用户写入。加载器会解析真实路径并拒绝越界，但不承诺抵御一个已经能在加载瞬间替换本机文件的攻击者；该攻击者本身已经拥有等价的本机代码执行能力。生产使用应依靠操作系统账户权限限制目录写入者。

如果模块越出 `runtime/private/`、缺少工厂、导出未知平台或缺少必备方法，执行器以稳定的 `connector_contract_failed` 关闭，不回显文件路径、模块异常或原始响应。
