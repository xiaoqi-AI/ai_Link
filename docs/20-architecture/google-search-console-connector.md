# Google Search Console Connector MVP

## 目标

`google_search_console` connector 为 SEO 恢复验证提供三层能力：

1. 仓库内可直接运行的公开站点只读检查，用于验证 HTTP、旧 URL 跳转、robots、sitemap、canonical 和 noindex。
2. 使用本机私有 OAuth 凭据的 Search Console 只读检查，用于调用 Sites、URL Inspection 和 Sitemaps API。
3. 始终由人工审批控制的 sitemap submit 能力；只读授权命令不会申请或启用写权限。

公开仓默认使用 Google API mock。只有显式传入 `--credentials` 时才读取本机私有授权文件；它不会模拟浏览器登录，不会执行 GSC Live Test，也不会点击 `Request indexing`。

## 本轮边界

已实现：

- `list_sites`
- `inspect_url`
- `list_sitemaps`
- `submit_sitemap` 的人工审批门和 mock 回执
- `check_public_crawlability`
- `generate_status_report`
- Auth Hub `gsc_monitor` 本地任务入口
- 中文 Markdown 报告和机器可读 JSON
- Google Desktop OAuth 2.0 PKCE/loopback 授权命令
- OAuth refresh token 换取短期 access token，access token 只保留在进程内存
- 真实 Sites list、URL Inspection 和 Sitemaps list REST client
- sitemap submit REST client 与第二层写权限保护

未实现：

- 使用真实 Google 账号完成只读 live 验收
- 写 scope 授权和真实 sitemap submit 验收
- 自动点击 `Request indexing`
- 定时调度器和历史趋势面板

OAuth client 配置、refresh token 与原始响应应留在本机 `runtime/private/` 或 secret manager。公开仓只保留无密钥实现、mock、脱敏结果和测试。

## 仓库内公开检查

PowerShell：

```powershell
npm.cmd run gsc:check -- --config examples/google-search-console/voice-site.public.json
```

保存 JSON 和中文报告：

```powershell
npm.cmd run gsc:check -- `
  --config examples/google-search-console/voice-site.public.json `
  --json `
  --output runtime/tmp/gsc-public-check.json `
  --report-output runtime/tmp/gsc-public-report.md
```

`--strict` 会在报告存在必须人工处理的技术异常时返回非零退出码，适合后续 CI 或定时任务。默认模式只生成报告，不因等待 Google 刷新而失败。

如果未来通过 npm 安装，可使用已打包的命令入口：

```powershell
npx ai-link-gsc --config examples/google-search-console/voice-site.public.json
```

安全限制：

- 只允许 HTTPS。
- 页面、robots、sitemap 和旧 URL 必须与 `publicBaseUrl` 同源。
- 会阻止 localhost、私有 IP 和解析到私有地址的主机。
- 拒绝内嵌账号密码或带敏感查询参数名的 URL，避免凭据进入报告。
- 单个响应默认最多读取 2 MiB，默认 15 秒超时。
- 单次最多检查 50 个 canonical URL、10 份 sitemap 和 50 个旧 URL 跳转。
- 不在结果中保存原始 HTML、robots 或 sitemap 正文。
- `gsc_monitor` 只保留当前配置 property 的权限摘要，不回显账号下其他 properties。

如果 `siteUrl` 使用 `sc-domain:example.com` 形式，还要提供用于公开抓取检查的 `publicBaseUrl`：

```json
{
  "siteUrl": "sc-domain:example.com",
  "publicBaseUrl": "https://www.example.com/",
  "urls": ["https://www.example.com/page"],
  "sitemaps": ["https://www.example.com/sitemap.xml"]
}
```

## 真实只读 OAuth 中文操作手册

### 第一步：确认授权边界

本阶段只申请：

```text
https://www.googleapis.com/auth/webmasters.readonly
```

它可以读取 Sites、URL Inspection 和 Sitemaps，不允许提交 sitemap。不要在聊天、issue、PR、知识库或普通日志中粘贴 client secret、authorization code、access token 或 refresh token。

### 第二步：配置 Google Cloud

1. 打开 Google Cloud Console，选择已有项目或创建专用于 AI Link GSC 验收的项目。
2. 在 API Library 搜索并启用 `Google Search Console API`。
3. 打开 Google Auth Platform：
   - Google Workspace 且项目属于同一组织时，可按组织策略选择 `Internal`。
   - 个人 Gmail 首次验收可选择 `External` + `Testing`，并把自己的 Google 账号加入 Test users。
4. 打开 Google Auth Platform 的 Clients 页面，选择 `Create client`。
5. Application type 选择 `Desktop app`，名称建议使用 `AI Link GSC Local Readonly`。
6. 下载 Desktop OAuth client JSON，并保存为：

```text
runtime/private/google-search-console/desktop-client.json
```

External + Testing 适合首轮验收，但 Google 当前规则下测试用户授权通常在 7 天后失效，不应直接作为长期无人值守方案。长期运行需再决定 Workspace Internal、生产 OAuth 或受控服务身份。

### 第三步：在本机授权

PowerShell：

```powershell
cd D:\codex_workplace\ai_Link
npm.cmd run gsc:authorize -- `
  --client-config runtime/private/google-search-console/desktop-client.json
```

命令会：

1. 生成 PKCE verifier/challenge 和随机 state。
2. 在 `127.0.0.1` 随机端口启动一次性回调。
3. 打开系统默认浏览器，不使用内嵌浏览器或模拟登录。
4. 只请求 `webmasters.readonly`。
5. 验证 callback state，并交换 refresh token。
6. 只把 authorized-user 凭据保存到：

```text
runtime/private/google-search-console/authorized-user.json
```

命令不会打印 token、authorization code 或 Google 原始响应。已有授权文件不会被静默覆盖；只有确认轮换时才使用 `--force`。

`runtime/private/` 可以阻止凭据进入 Git 和知识库，文件也会尝试设置为当前用户可读写，但它不是应用层加密保险箱。首轮验收完成后，长期自动化应把 refresh token 迁入 Bitwarden Secrets Manager、Google Secret Manager 或等价的受控密钥服务；在迁移前不要把该文件同步、备份或发送给其他人。

### 第四步：执行真实只读检查

```powershell
npm.cmd run gsc:check -- `
  --config examples/google-search-console/voice-site.public.json `
  --credentials runtime/private/google-search-console/authorized-user.json `
  --json `
  --output runtime/tmp/gsc-live-check.json `
  --report-output runtime/tmp/gsc-live-report.md
```

真实只读模式默认维护最多 90 次脱敏快照：

```text
runtime/private/google-search-console/history.json
```

历史只保存 property、检查时间、URL、统一状态、公开检查布尔摘要、计数和稳定错误码，不保存 OAuth 凭据、Google 原始响应或错误正文。第二次及后续运行时，中文报告的“今日变化”会列出状态变化、改善、退化、新增/移除 URL，以及新增/已恢复问题。可用 `--history-limit 30` 调整保留数量；临时检查不希望写历史时使用 `--no-history`。

验收成功应满足：

- `mode` 为 `private-api-client+public-check`。
- `googleApi.mode` 为 `private-client`。
- 当前 `siteUrl` 出现在 `googleApi.sites`。
- 每个配置 URL 都有脱敏的 `inspection` 字段。
- `googleApi.errors` 为空。
- 报告仍为中文，且不包含 token、Cookie、账号列表、原始 Google 响应或登录截图。

常见失败：

| 错误码 | 含义 | 处理 |
| --- | --- | --- |
| `gsc_oauth_refresh_failed` | refresh token 失效或测试授权过期 | 重新运行只读授权；先确认 OAuth app 状态 |
| `gsc_permission_denied` | 授权账号无权访问目标 property | 在 GSC 的 Settings > Users and permissions 核对账号权限 |
| `gsc_property_not_listed` | Sites list 未返回配置 property | 核对 `siteUrl` 是否与 GSC 中的 URL-prefix 或 Domain property 完全一致 |
| `gsc_quota_exceeded` | Google API 配额暂时不可用 | 等待配额恢复，不循环重试、不绕过配额 |

### 第五步：预览并启用 Windows 每日监控

先只生成计划，不创建任务：

```powershell
npm.cmd run gsc:schedule:plan
```

计划会显示运行账号、每日时间、配置、凭据、报告和历史路径，但不会读取或打印凭据内容。只有 `credentialReady` 与 `configReady` 都为 `true` 后才允许应用。

确认每天本地时间后再执行，例如每天 09:00：

```powershell
powershell -ExecutionPolicy Bypass -File tools/install-gsc-monitor-task.ps1 `
  -At "09:00" `
  -Apply
```

如果本机 Node 访问 Google token endpoint 需要代理，可在注册任务时显式传入本机代理地址：

```powershell
powershell -ExecutionPolicy Bypass -File tools/install-gsc-monitor-task.ps1 `
  -At "09:00" `
  -ProxyUrl "http://127.0.0.1:4780" `
  -Apply
```

代理地址只写入本机 Windows 计划任务参数，不进入公开配置；如果代理不可用，下一轮会报告 OAuth 刷新失败而不会写入 Google。

该任务只在当前 Windows 用户存在交互会话时运行，调用 `tools/run-gsc-monitor.ps1`，最长运行 30 分钟；如果上一轮仍在执行，新一轮会被忽略，避免两个进程同时覆盖历史文件。任务固定输出：

- 脱敏 JSON：`runtime/tmp/gsc-live-check.json`
- 中文报告：`runtime/tmp/gsc-live-report.md`
- 脱敏历史：`runtime/private/google-search-console/history.json`

监控检测到必须人工处理的异常时会返回退出码 2，并在报告中列出问题；第一版不自动发送邮件、短信或聊天消息。通知渠道属于后续独立配置，不能把凭据或原始 Google 响应放进通知正文。

官方操作依据：

- https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://support.google.com/cloud/answer/15549257
- https://developers.google.com/identity/protocols/oauth2/production-readiness/overview

## Auth Hub 任务入口

创建任务时使用 `gsc_monitor`：

```json
{
  "workflow": "gsc_monitor",
  "input": {
    "siteUrl": "https://voice.xiao-qi-ai.com/",
    "urls": [
      "https://voice.xiao-qi-ai.com/when-to-start-talking-to-baby-in-the-womb"
    ],
    "sitemaps": [
      "https://voice.xiao-qi-ai.com/sitemap.xml"
    ],
    "legacyUrls": {
      "https://voice.xiao-qi-ai.com/when-to-start-talking-to-baby-in-the-womb.html": "https://voice.xiao-qi-ai.com/when-to-start-talking-to-baby-in-the-womb"
    }
  }
}
```

公开抓取条件正常而 Google 尚未收录时，任务会正常完成并归类为 `ready_for_google`、`discovered_not_indexed` 或 `crawled_not_indexed`。robots、sitemap、HTTP、canonical、noindex 或旧 URL 跳转异常会进入 `needs_action`，由人工处理后重试。

## 状态口径

| 状态 | 含义 |
| --- | --- |
| `ready_for_google` | 公开技术条件正常，等待 Google |
| `indexing_requested_by_user` | 用户已在 GSC 手动提交索引请求 |
| `indexed` | URL Inspection 显示已索引 |
| `discovered_not_indexed` | Google 已发现但尚未索引 |
| `crawled_not_indexed` | Google 已抓取但尚未索引 |
| `blocked_by_robots` | 公开检查或 URL Inspection 显示 robots 阻挡 |
| `sitemap_error` | sitemap 不可读、解析失败或缺少 canonical URL |
| `manual_action_required` | HTTP、canonical、noindex、旧 URL 跳转等需要人工修复 |
| `quota_wait` | 用户反馈人工请求配额已耗尽，等待下一日 |

`operatorStates` 可记录 `indexing_requested_by_user` 或 `quota_wait`，但它只表示人工流程状态，不会触发自动索引请求。

## 真实 Google API 人工门禁

发起真实账号授权前需要确认：

1. Google Cloud 项目与 Search Console API 已启用。
2. Desktop OAuth client、授权账号和 property 权限已确认。
3. 只读阶段使用 `webmasters.readonly`；真实 sitemap submit 必须提升到 `webmasters`。
4. refresh token 只通过 secret manager 或本机 `runtime/private/` 注入；access token 只驻留内存。
5. `submit_sitemap` 每次都必须带明确审批；`Request indexing` 永远保留人工操作。

私有 API client 默认以 `en-US` 请求 URL Inspection，保持机器状态分类稳定；最终报告仍输出中文。

URL Inspection API 返回的是 Google 索引中的版本，不能执行 live URL test。Indexing API 只适用于带 `JobPosting` 或 `BroadcastEvent` 的特定页面，普通文章不使用该 API。

官方参考：

- https://developers.google.com/webmaster-tools/v1/api_reference_index
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- https://developers.google.com/webmaster-tools/v1/sitemaps
- https://developers.google.com/webmaster-tools/v1/sitemaps/submit
- https://developers.google.com/search/apis/indexing-api/v3/using-api

## 验收

仓库测试覆盖：

- connector 合同和能力模式不泄露私有实现。
- Desktop OAuth 只允许 read-only scope，并验证 PKCE、state 和 loopback callback。
- OAuth refresh token 只用于内存换取 access token；错误不回显 Google 原始响应。
- Sites、URL Inspection、Sitemaps list 使用官方 REST endpoint 和请求结构。
- read-only client 即使收到 connector 审批，也会拒绝 sitemap submit。
- 历史文件只保留脱敏快照，跨 property 复用会失败，默认最多保留 90 次。
- Windows 定时任务安装器默认只输出计划，缺少只读 OAuth 凭据时拒绝应用。
- HTTP、robots、sitemap、canonical、noindex 和 301/308 旧 URL 跳转检查。
- `Discovered - currently not indexed` 在技术条件正常时不会误判为站点故障。
- sitemap submit 未审批时返回 `manual_action_required`。
- `gsc_monitor` 生成脱敏报告 artifact。

## 2026-07-11 真实只读联调记录

本轮使用个人 Google 账号完成 Search Console 真实只读验证，授权文件只保存在本机 `runtime/private/google-search-console/`，未进入公开仓。

### 结论

- Google Cloud 侧启用 `Google Search Console API`，OAuth app 保持 `External + Testing`，测试用户为实际授权账号。
- Desktop OAuth client 使用系统浏览器、PKCE、loopback callback 和 `webmasters.readonly` scope，授权成功后生成 `authorized-user.json`。
- `voice.xiao-qi-ai.com` 在 GSC 中属于 Domain Property `sc-domain:xiao-qi-ai.com`，不是 URL-prefix property `https://voice.xiao-qi-ai.com/`。
- 使用 URL-prefix 作为 `siteUrl` 会导致 `gsc_property_not_listed` / `gsc_permission_denied`；使用 `sc-domain:xiao-qi-ai.com` 并设置 `publicBaseUrl` 后，Sites、Sitemaps list 与 URL Inspection 均可读。
- 两个 sitemap 重新提交后，GSC API 显示 `errors: 0`、`warnings: 0`，旧的 `gsc_sitemap_error` 恢复。
- 当前站点公开抓取条件正常，剩余状态是 Google Index 刷新等待，不是站点技术故障。

### Domain Property 配置

真实 GSC 属性是 Domain Property 时，配置必须使用 `sc-domain:`，并额外提供公开抓取基准：

```json
{
  "siteUrl": "sc-domain:xiao-qi-ai.com",
  "publicBaseUrl": "https://voice.xiao-qi-ai.com/",
  "urls": [
    "https://voice.xiao-qi-ai.com/"
  ],
  "includeSitemapUrls": true,
  "maxSitemapUrls": 50,
  "sitemaps": [
    "https://voice.xiao-qi-ai.com/sitemap.xml"
  ]
}
```

`includeSitemapUrls` 用于全量只读监控：connector 会先读取配置的 sitemap，再把发现的同源 HTTPS URL 合并进本轮公开检查和 URL Inspection。`maxSitemapUrls` 是安全上限，默认 50，避免 sitemap 异常膨胀导致配额和运行时间失控。配置里的 `urls` 仍建议保留首页或核心 URL 作为种子和兜底。

仓库示例：

```powershell
npm.cmd run gsc:check -- `
  --config examples/google-search-console/voice-site.domain.public.json
```

本机真实只读验证示例：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:4780"
$env:HTTP_PROXY="http://127.0.0.1:4780"

node --use-env-proxy dist/connectors/gscCheck.js `
  --config examples/google-search-console/voice-site.domain.public.json `
  --credentials runtime/private/google-search-console/authorized-user.json `
  --history runtime/private/google-search-console/domain-history.json `
  --json `
  --output runtime/tmp/gsc-live-domain-check.json `
  --report-output runtime/tmp/gsc-live-domain-report.md
```

Windows 定时任务默认使用同一份 Domain Property 配置，输出到：

- 脱敏 JSON：`runtime/tmp/gsc-live-domain-check.json`
- 中文报告：`runtime/tmp/gsc-live-domain-report.md`
- 脱敏历史：`runtime/private/google-search-console/domain-history.json`

代理地址只是本机实测环境示例，不应写入公开配置、CI 或用户文档中的固定要求。若 Node 直连 Google 超时，但浏览器和 PowerShell 可访问 Google，可临时使用 `node --use-env-proxy` 配合当前终端的 `HTTP_PROXY` / `HTTPS_PROXY`。

### 本轮观测结果

- `googleApi.sites` 返回 `sc-domain:xiao-qi-ai.com`，权限为 `siteOwner`。
- `sitemap.xml` 和 `sitemap-basic.xml` 均为 `Success`，发现 16 页。
- 3 个目标 URL 的 HTTP、robots、sitemap、canonical 和 noindex 公开检查均通过。
- URL Inspection：
  - `https://voice.xiao-qi-ai.com/`：`Crawled - currently not indexed`
  - `https://voice.xiao-qi-ai.com/guides`：`URL is unknown to Google`
  - `https://voice.xiao-qi-ai.com/when-to-start-talking-to-baby-in-the-womb`：`Crawled - currently not indexed`

### 人工门禁经验

- 不需要发布 OAuth app；`External + Testing + 测试用户` 已足够本机验证。
- 不需要开 Google Cloud billing 或 free trial。
- PowerShell 不会显示授权账号，这是安全设计；账号一致性应由 Google 授权页、GSC 用户界面和 API property 权限共同证明。
- 如果浏览器显示 `Authorization state did not match`，通常是旧 OAuth 标签页或多轮重试导致 state 错配；关闭旧 callback 页后重启当前授权流程。
- GSC 中 sitemap `General HTTP error` 可能是旧状态。若本机和 Googlebot UA 均可读取 sitemap，可在 GSC 重新提交 sitemap，随后用 API 复测确认 `errors: 0`。
