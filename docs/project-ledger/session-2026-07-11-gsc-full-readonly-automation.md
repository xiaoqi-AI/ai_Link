# 2026-07-11 GSC 全量只读监控与自动化

## 结论

AI Link 的 `google_search_console` connector 已从抽样只读验证推进到 ParentingGame 需求范围内的全量只读监控试运行：

- 使用 Domain Property：`sc-domain:xiao-qi-ai.com`
- 公开基准：`https://voice.xiao-qi-ai.com/`
- 从 `sitemap.xml` 和 `sitemap-basic.xml` 自动展开同源 URL
- 本轮共监控 16 个 URL
- GSC API 只读、公开抓取检查、中文报告和脱敏历史均已跑通
- Windows 每日计划任务已注册，默认每天本地时间 13:00 运行

## 用户决策

用户确认：

1. 启动 AI Link GSC 只读试运行。
2. 监控对象范围覆盖全部需求范围，不限于 3-5 个核心 URL。
3. 允许使用已有本机 OAuth 授权文件。
4. 开启自动定时任务。
5. 发现问题后允许自动修复 ParentingGame。

## 自动修复边界

“自动修复 ParentingGame”仅适用于可验证的站点技术问题：

- sitemap 缺失或不包含 canonical URL
- canonical 缺失或指向错误
- noindex 误配置
- robots 阻挡
- 旧 `.html` 跳转异常
- HTTP 状态异常

以下事项不自动执行：

- Google Search Console `Request indexing`
- GSC Live Test
- sitemap submit / 重新提交 sitemap
- Google 配额绕过
- SEO 文案、内容策略、页面选题调整
- 生产发布或域名/Cloudflare 配置变更

若报告发现可自动修复的 ParentingGame 技术问题，AI Link 先生成问题清单，再在 ParentingGame 仓库内按最小范围修改和验证。

## 本轮实现

- `includeSitemapUrls`：配置开启后，connector 会先读取 sitemap，再把发现的同源 HTTPS URL 合并到本轮公开检查和 URL Inspection。
- `maxSitemapUrls`：默认 50，防止 sitemap 异常膨胀导致配额、运行时间和报告规模失控。
- 定时任务默认切换到 `examples/google-search-console/voice-site.domain.public.json`。
- 定时输出切换为 domain 专用路径：
  - JSON：`runtime/tmp/gsc-live-domain-check.json`
  - 报告：`runtime/tmp/gsc-live-domain-report.md`
  - 历史：`runtime/private/google-search-console/domain-history.json`
- 定时任务支持 `-ProxyUrl`，用于本机 Node 需要代理访问 Google token endpoint 的环境。

## 试运行结果

真实只读运行结论：

- `googleApi.sites` 返回 `sc-domain:xiao-qi-ai.com`，权限为 `siteOwner`。
- `sitemap.xml` 和 `sitemap-basic.xml` 均可读，GSC API 显示 `errors: 0`、`warnings: 0`。
- 16 个 URL 全部通过公开检查：HTTP 200、robots、sitemap、canonical 和 noindex。
- 2 个 URL 显示 `crawled_not_indexed`：
  - `https://voice.xiao-qi-ai.com/`
  - `https://voice.xiao-qi-ai.com/when-to-start-talking-to-baby-in-the-womb`
- 其余 URL 当前为 `ready_for_google`。
- 当前没有必须人工处理的技术异常。

## 定时任务

任务名称：`AI Link GSC Readonly Monitor`

状态：已注册，`Ready`

计划：每天本地时间 13:00，仅在当前 Windows 用户存在交互会话时运行。

Codex heartbeat：每天本地时间 13:15 回看最新脱敏报告，并在当前任务里中文提醒用户：今日结论、是否需要 ParentingGame 修复、是否只是 Google indexing 延迟、以及 AI Link 自动化/OAuth/代理/网络是否异常。

安全边界：

- 使用只读 Search Console OAuth 凭据。
- 不执行 `Request indexing`。
- 不执行 sitemap submit。
- 不写入 Google 状态。
- 不把凭据、token 或原始敏感响应写入公开仓。

本机实测 Node 访问 Google token endpoint 需要代理，因此注册任务时使用：

```powershell
ProxyUrl = http://127.0.0.1:4780
```

该代理值仅用于本机任务参数，不写入公开配置。

## 验证

- `npm.cmd run check` 通过。
- `npm.cmd test` 通过：109 项测试。
- `node --test tests/connector-contracts.test.js` 通过：8 项测试。
- `npm.cmd run security:scan` 通过。
- `tools/run-gsc-monitor.ps1 -ProxyUrl "http://127.0.0.1:4780"` 真实只读运行通过。
- Windows 计划任务 `AI Link GSC Readonly Monitor` 已存在且状态为 `Ready`，触发时间为本地 13:00。

## 后续

1. 观察下一次自动报告是否正常生成。
2. 如果报告出现技术异常，按自动修复边界进入 ParentingGame 最小修复。
3. 如果报告仅显示 `ready_for_google` 或 `crawled_not_indexed`，继续等待 Google 刷新，并由用户在 GSC UI 手动执行必要的 `Request indexing`。
