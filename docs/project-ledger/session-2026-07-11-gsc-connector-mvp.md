# 2026-07-11 Google Search Console Connector MVP

## 结论

AI Link 已形成面向 prenatal voice 海外 SEO 验证的公开安全 GSC connector MVP：可以真实读取公开页面、robots.txt 和 sitemap，检查 canonical、noindex 与旧 `.html` 跳转，统一归类 URL 状态并生成中文报告；Google Search Console 官方 API 在公开仓仍使用 mock，真实 OAuth/API client 和 sitemap 写操作保留人工门禁。

本轮真实公开检查显示：3 个重点 URL 均返回 200，robots.txt 允许抓取并声明两份配置 sitemap，两份 sitemap 均包含重点 canonical URL，页面 canonical 正确且没有 noindex，两个旧 `.html` URL 均以 308 跳转到 canonical URL。该结论只证明公开技术抓取条件，不代表 Google 已完成索引。

## 迭代边界卡

### 需求

- 用户目标：让 AI Link 支持 ParentingGame prenatal voice 海外验证项目的 GSC 自动监控需求。
- 成功标准：无需 Google 凭据即可运行公开抓取检查并生成中文报告；Google API 能力有明确合同和 mock；技术正常但尚未索引时不误判为站点故障。
- 输入材料：ParentingGame 的 `ai-link-gsc-connector-mvp-brief-20260711.md`、AI Link connector/Auth Hub 现有实现、Google 官方 Search Console API 文档。
- 输出形态：connector 代码、任务入口、仓库命令、示例配置、测试、中文文档和项目账本。
- 非目标：真实 OAuth、真实 URL Inspection/Sites/Sitemaps 调用、自动 sitemap submit、自动 Request indexing、定时调度和趋势面板。
- 用户确认点：进入真实 Google OAuth/API 验收与 sitemap submit 前，需确认账号、property、授权范围、凭据托管和写操作审批策略。

### 预期开发工作

- 允许改动：`src/connectors/`、Auth Hub 任务校验/执行器、测试、`package.json`、公开文档、示例和项目账本。
- 明确不碰：provider 路由、Coze provider、真实 Google 凭据、本机登录态、发布流程和生产部署。
- 实现路径：复用现有 connector registry、Auth Hub task/result/artifact 和 `needs_action` 状态；不新增第三方依赖或新服务。
- 工作规模：局部跨 connector、任务入口和文档的公开行为增量。

### 验证

- 聚焦测试：connector 合同、Google lag 状态归类、sitemap 审批门、私网重定向阻断和 `gsc_monitor` 任务。
- 全量回归：`npm.cmd test`，74 个 TypeScript/CLI 测试与 84 个 Auth Hub/治理测试全部通过，共 158 项。
- 静态与安全：`npm.cmd run check`、`npm.cmd run security:scan`、`npm.cmd run package:check:json` 和 `npm.cmd run package:install-smoke:json` 通过；安装后的 `ai-link-gsc --help` 已验收。
- 业务样例：`npm.cmd run gsc:check -- --config examples/google-search-console/voice-site.public.json` 通过，生成 JSON 与中文 Markdown 到 `runtime/tmp/`。
- 证据边界：运行结果只记录 URL、HTTP/索引状态、时间和错误类型，不保存原始页面、OAuth token、Cookie、账号信息或截图。

### 边界控制

- 范围边界：只完成 Phase 1 的公开安全核心和 Phase 2 的 submit 审批门，不实现真实写操作与调度。
- 安全边界：只允许同源 HTTPS，阻止 localhost、私有地址、跨域/私网重定向以及含凭据或敏感查询参数的 URL，限制请求数量、响应大小与超时；每日报告只保留当前 property 摘要。
- 权限边界：真实 Google OAuth/API client、Search Console property 授权和 sitemap submit 属于后续人工确认。
- 停止条件：需要真实凭据、账号登录、外部写操作、配额消耗或生产调度时停止自动推进。

## 主要实现

- `google_search_console` 增加 6 项能力合同与 capability mode。
- 公开默认采用 `public-check+mock-google-api`，可从私有运行时注入 Google API client。
- `gsc:check` 读取 JSON 配置，输出脱敏 JSON 和中文 Markdown。
- `gsc_monitor` 接入 Auth Hub；技术问题进入 `needs_action`，单纯等待 Google 刷新正常完成。
- sitemap submit 未明确审批时返回 `manual_action_required`。
- URL Inspection 只使用白名单字段，不保留原始 Google 响应。

## 官方边界依据

- Search Console API 提供 Search Analytics、Sitemaps、Sites 和 URL Inspection。
- URL Inspection API 只返回 Google 索引中的版本，不能执行 live URL test。
- sitemap submit 需要 `webmasters` 写权限；只读检查可使用 `webmasters.readonly`。
- Indexing API 只适用于 `JobPosting` 或带 `BroadcastEvent` 的直播视频页面，普通文章不接入。

## 后续人工门禁

1. 确认用于 prenatal voice 的 Google Cloud 项目与 Search Console property。
2. 决定 OAuth 使用个人授权还是受控服务身份，并将 token 交给 secret manager 或本机私有运行时。
3. 先只读验收 Sites、URL Inspection 和 Sitemaps list。
4. 只有明确批准写权限和审批策略后，才验收真实 sitemap submit。
5. `Request indexing` 继续由用户在 GSC 页面手动完成。

## 尚未承诺

- 每日定时执行、历史趋势和异常通知仍属于下一阶段。
- 当前公开检查不能证明 Google 已索引，也不能替代 GSC Live Test、Pages 报告或 Crawl stats 页面。
- Search Analytics 不在本轮实现范围。
