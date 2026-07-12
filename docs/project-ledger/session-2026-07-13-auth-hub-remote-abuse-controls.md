# Auth Hub 远程控制台滥用防护

日期：2026-07-13

状态：实现、本地全量验证和提交后全新克隆验证完成；等待知识库镜像和 GitHub CI。本轮只处理浏览器认证请求面，不执行远程部署或真实账号调用。

## 需求

- 用户目标：继续推进 Auth Hub 远程化，使公网控制台在进入真实部署前具备明确的跨站请求保护和登录暴力尝试防护。
- 成功标准：所有控制台写操作要求与当前浏览器会话绑定的 CSRF token；登录失败达到阈值后返回 `429` 和 `Retry-After`；外部或协议相对 `next` 地址不能离开 Auth Hub；退出改为 POST。
- 输入材料：PR #24 的 Access JWT/会话安全、PR #25 的部署就绪加固、现有 UI 路由与会话实现、独立安全评审和 Coze 复核。
- 输出形态：安全模块、配置项、UI 表单、路由集成、自动化测试、远程 smoke 适配、公开文档和项目台账。
- 非目标：数据删除、Render Cron、真实 Postgres 清理、分布式限流、Redis、Cloudflare Rate Limiting 配置、远程部署、真实 secret。

## 实现边界

- CSRF token 由服务端签发并与当前会话或登录前浏览器 cookie 绑定；不进入 URL、日志、审计或数据库。
- 创建任务、批准/拒绝、重试和退出全部执行 token 校验；Bearer API 不受浏览器 CSRF 机制影响。
- 登录前使用独立预认证绑定；登录成功后旋转绑定，避免复用登录前 token。
- 登录限流按已验证 Cloudflare Access 身份优先分桶；未启用 Access 的本地开发才回退到规范化网络地址。
- 默认 15 分钟窗口最多 5 次失败，锁定 15 分钟；容量必须有上限，过期条目自动回收，不保存密码、JWT、Cookie、原始邮箱或 IP。
- 成功登录清除当前桶的失败记录；锁定期间即使密码正确也不能绕过。
- `next` 只允许以单个 `/` 开头的本地路径，拒绝 `//`、绝对 URL、反斜杠和控制字符。
- 已验证 Access 用户的控制台会话绑定同一身份；service token 不能进入浏览器 UI。
- UI 响应增加 CSP、frame deny、nosniff、no-referrer、Permissions Policy 与 no-store；写操作成功后统一使用 303。
- 任务仅允许从 `action_required` 或 `failed` 重试；非法审批返回 400，重复审批返回 409，不产生第二次状态变更。
- Render 蓝图固定单 Web 实例；当前有界登录限流不是分布式限流，扩容前必须另行决策共享状态方案。

## 验收

- 合法 token 可以创建任务、批准/拒绝、重试和退出。
- token 缺失、篡改、跨会话或过期时返回 403，且业务状态不变化。
- 登录失败在阈值内返回 401，超过阈值返回 429；不同身份互不影响，成功登录清零，时间窗口到期后恢复。
- 限流桶容量受控，过期数据可回收，测试和错误响应不泄露限流键或凭据。
- 登录与会话 `next` 参数不能形成开放重定向。
- 远程 mock smoke、Access JWT、会话过期、API token 权限、审批和执行器链路保持通过。

## 人工门禁与停止条件

- 本轮不需要账号、付费或远程资源，因此不新增人工执行项。
- 若限流必须跨实例共享、需要付费边缘服务或无法稳定获得已验证 Access 身份，停止并由负责人选择 Postgres/Cloudflare 方案。
- 若任何控制台写路由需要白名单绕过 CSRF 才能通过，停止并修正调用方，不增加测试后门。
- 数据清理另开独立迭代：默认 dry-run，显式 apply 才能删除；真实 Postgres 事务、备份与恢复验收完成前不得用于生产数据。

## 本地验证结果

- `npm run check`：通过。
- 定向安全/任务/部署测试：43 项通过。
- `npm test`：核心与 CLI 74 项、Auth Hub 174 项，共 248 项通过。
- `npm run package:check`：36/36 通过。
- `npm run package:install-smoke`：16/16 通过。
- `npm run security:scan`：377 个公开文件通过。
- `npm audit --audit-level=high`：0 个漏洞。
- `tools/check-governance.ps1`：通过。
- 本地完整远程 smoke：14 项通过，任务最终状态为 `completed`。
- 缺少应用密码的 smoke：按预期非零退出，证明登录验证不会静默跳过。
- `npm run verify:fresh`：通过，独立克隆耗时约 184 秒。
