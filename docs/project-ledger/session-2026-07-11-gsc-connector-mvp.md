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

## 同日继续推进：真实 GSC 只读验收完成

用户批准 GSC 只读实测后，本轮完成了从 Google Cloud 到 Search Console 的端到端验证：

- Google Cloud 项目已启用 Search Console API。
- OAuth app 使用 `External + Testing`，测试用户确认为实际授权账号。
- Desktop OAuth client 已完成本机授权，`authorized-user.json` 仅保存在 `runtime/private/google-search-console/`。
- 本机 Node 访问 Google 需显式继承系统代理；使用 `node --use-env-proxy` 后授权与 API 调用均可完成。
- Search Console UI 证明授权账号能访问 `xiao-qi-ai.com` Domain Property。
- 真实 API 验证发现 AI Link 配置应使用 `sc-domain:xiao-qi-ai.com`，而不是 URL-prefix `https://voice.xiao-qi-ai.com/`。
- 新增公开示例 `examples/google-search-console/voice-site.domain.public.json`，用于记录 Domain Property + `publicBaseUrl` 的正确配置方式。
- 重新提交 `sitemap.xml` 与 `sitemap-basic.xml` 后，GSC UI 和 API 均显示 sitemap `Success`，发现 16 页，`gsc_sitemap_error` 已恢复。
- 最新真实只读报告结论为：站点技术抓取条件正常，Google Index 仍在刷新。

最新 URL Inspection 状态：

- `https://voice.xiao-qi-ai.com/`：Google 已抓取但尚未索引。
- `https://voice.xiao-qi-ai.com/guides`：Google 还未知，但公开技术条件正常。
- `https://voice.xiao-qi-ai.com/when-to-start-talking-to-baby-in-the-womb`：Google 已抓取但尚未索引。

后续建议：

1. 不再反复提交 sitemap，避免把刷新等待误判为 sitemap 故障。
2. 对核心 URL 在 GSC UI 中人工执行 URL Inspection，并按配额手动 `Request indexing`。
3. 若进入长期监控，使用 `sc-domain:xiao-qi-ai.com` 配置和独立历史文件 `domain-history.json`。
4. 是否安装 Windows 每日监控任务仍需用户确认执行时间。

## 同日继续推进：真实只读 OAuth/API 实现

在公开安全核心完成后，继续补齐不需要触碰真实账号即可开发和验证的 OAuth/API 层：

- 新增 Google Desktop OAuth 2.0 授权命令，固定只申请 `webmasters.readonly`。
- 授权流程使用系统浏览器、PKCE S256、随机 state 与 `127.0.0.1` 随机端口回调，不模拟登录、不支持 OOB 复制授权码。
- authorized-user 凭据在仓库内只能保存到 `runtime/private/`；授权命令不打印 token、authorization code 或 Google 原始响应。
- refresh token 只用于进程内换取短期 access token；access token 不写入凭据文件。
- 新增真实 Sites list、URL Inspection 和 Sitemaps list REST client，使用官方 endpoint 与请求结构。
- sitemap submit REST 调用已具备第二层 client 写权限保护，但只读授权命令无法启用它；真实写权限和调用仍是独立人工门禁。
- `ai-link-gsc` 可通过 `--credentials` 进入私有只读 API 模式；默认行为仍是公开检查 + Google API mock。

本阶段代码验收可以在无真实 Google 账号时完成。业务验收仍需用户确认 Google Cloud 项目、Desktop OAuth client、授权账号和 GSC property 后，在本机执行一次真实只读授权；在这一步之前不能宣称 Sites、URL Inspection 或 Sitemaps 已通过 live 验收。

## 同日继续推进：历史变化与本地每日监控

等待用户创建 Google Desktop OAuth client 期间，继续完成不依赖真实账号的自动监控基础：

- `ai-link-gsc` 在真实只读模式下默认维护 `runtime/private/google-search-console/history.json`。
- 每个快照只包含 property、检查时间、URL、统一状态、公开检查摘要、计数和稳定错误码；不保存 OAuth token、Cookie、账号列表、原始 Google 响应或错误正文。
- 历史默认保留 90 次，最多 365 次；超过 2 MiB、跨 property 或结构不合法时拒绝读取/写入。
- 中文报告“今日变化”支持首个基线、无变化、状态变化、改善、退化、新增/移除 URL、新增问题和已恢复问题。
- 两次公开站点冒烟生成 2 个快照；第二次报告正确输出“URL 状态和技术问题没有变化”，历史文件未出现 access token 字段。
- 新增 Windows 每日监控 runner 与 plan-first 安装器。默认只输出计划；只有凭据已就绪并显式传入 `-Apply` 时才注册当前用户的交互式计划任务。

当前仍未自动注册系统任务，因为 authorized-user 凭据尚不存在，且用户尚未确认具体每日执行时间。真实通知渠道、sitemap 写权限和真实提交继续保留独立门禁。
