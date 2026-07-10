# Google Search Console Connector MVP

## 目标

`google_search_console` connector 为 SEO 恢复验证提供两层能力：

1. 仓库内可直接运行的公开站点只读检查，用于验证 HTTP、旧 URL 跳转、robots、sitemap、canonical 和 noindex。
2. 可注入私有 Google API client 的能力合同，用于后续接入 Sites、URL Inspection 和 Sitemaps API。

公开仓默认使用 Google API mock。它不会读取 Google OAuth token，不会模拟浏览器登录，不会执行 GSC Live Test，也不会点击 `Request indexing`。

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

未实现：

- Google OAuth 登录和 token 刷新
- 真实 Search Console API client
- 自动提交 sitemap
- 自动点击 `Request indexing`
- 定时调度器和历史趋势面板

真实 Google API client、凭据与原始响应应留在私有仓、本机 `runtime/private/` 或 secret manager；公开仓只保留接口、mock、脱敏结果和测试。

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

后续接入私有 client 前需要确认：

1. Google Cloud 项目与 Search Console API 已启用。
2. OAuth client、授权账号和 property 权限已确认。
3. 只读阶段使用 `webmasters.readonly`；真实 sitemap submit 必须提升到 `webmasters`。
4. token 只通过 secret manager 或本机私有运行时注入。
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
- HTTP、robots、sitemap、canonical、noindex 和 301/308 旧 URL 跳转检查。
- `Discovered - currently not indexed` 在技术条件正常时不会误判为站点故障。
- sitemap submit 未审批时返回 `manual_action_required`。
- `gsc_monitor` 生成脱敏报告 artifact。
