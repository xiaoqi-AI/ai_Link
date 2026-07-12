# Auth Hub 远程访问安全加固

日期：2026-07-13

状态：本地实现与完整验证完成；堆叠草稿 PR #24 已创建且 CI 通过，等待负责人按 PR #22 -> PR #23 -> PR #24 顺序审查。未部署远端服务，未读取真实 Cloudflare、Render 或平台凭据。

## 背景

Auth Hub 已具备 Render/Postgres 蓝图、Cloudflare Access 接入和远程 smoke，但审计发现四个上线前缺口：Access JWT 的 issuer/audience 未配置时可能退回信任请求邮件头；转发邮件头没有与 JWT `email` 绑定；service token 的 `common_name` 可能被误作用户邮箱；应用内会话只依赖浏览器 `Max-Age`，服务端没有强制绝对过期。若 Render 原始域名被直接访问，这些退化路径会削弱双重门禁。

## 本轮决策

1. `AI_LINK_REQUIRE_CLOUDFLARE_ACCESS=true` 时必须验证 Access 应用 JWT；缺少 audience 或 issuer/team domain 直接失败关闭。
2. JWT 仅允许 RS256，并校验签名、issuer、audience、时间声明和 `type=app`。
3. 用户身份只取已验证 JWT 的 `email`；转发邮件头如果存在，必须与 JWT 完全一致。
4. 服务令牌只通过已验证 JWT 的 `common_name` 识别，且必须显式允许；不能把 `common_name` 当用户邮箱。
5. 控制台会话签名载荷增加 schema、签发时间和绝对到期时间；服务端每次请求都验证，默认 8 小时、允许 5 分钟至 24 小时。
6. 畸形 Cookie、错误长度签名、旧格式无到期 Cookie 和到期 Cookie 全部失败关闭。

## 价值

- 即使有人绕过 Cloudflare 域名直接访问 Render 源站，也不能靠伪造邮件头通过 Access 门禁。
- 自动执行器与浏览器用户身份不会混淆，授权邮箱白名单只作用于真实用户 JWT。
- 被复制的应用内 Cookie 无法脱离服务端绝对时间无限重放。
- 不改变现有应用密码、API bearer token、审批门禁或私有连接器边界。

## 风险与兼容性

- 部署后旧控制台 Cookie 会失效一次，需要重新登录；这是有意的安全升级。
- 生产环境若缺少 Access AUD 或 team domain/issuer，应用会拒绝启动或所有受保护请求；部署前必须按清单配置。
- Service Auth 必须使用同一 Access 应用生成的 JWT，并在应用策略中允许；普通 Client ID/Secret 不能绕过 JWT 验证。
- JWKS 由 Cloudflare team domain 远程读取并缓存；Cloudflare 密钥轮换由远程 JWK 集处理。

## 验证范围

- 独立 Coze 反证评审确认四项问题及优先级与本地审计一致：JWT 配置退化、service token 误分类、邮件身份不一致和会话无限重放。
- 生产配置缺少 Access 验证参数时拒绝启动；远程就绪报告不会把关闭的 origin guard 或缺失 issuer/身份策略误报为 `smokeReady`。
- 本地临时 JWKS 签发 RS256 用户 JWT 和 service-token JWT，验证合法访问、签名损坏、错误 token 类型、邮件头身份不一致、邮箱白名单和 service-token 显式许可。
- 会话在精确到期边界拒绝，畸形 Cookie 与错误长度签名不抛异常。
- 完整测试通过：核心 74 项、Auth Hub 167 项，共 241 项；36 项打包边界检查、371 个公开文件敏感扫描和高危依赖审计通过，依赖漏洞为 0。
- 使用纯测试值执行生产部署预检，结果 0 失败、0 警告；本机远程形态 smoke 14 项通过，测试服务已停止。
- fresh clone 已从提交 `b40d5af` 重新克隆并完成依赖安装、完整验证与敏感扫描，耗时约 201 秒；知识库镜像已同步并核验。

## 后续人工门禁

1. 先合并 PR #22，再把 PR #23 调整到 `main` 并合并；本轮远程安全 PR 继续作为下一层叠加依赖。
2. 负责人确认专用域名、授权邮箱范围、是否允许 service token，以及控制台会话时长是否维持推荐的 8 小时。
3. Secret owner 在 Render/secret manager 配置真实 AUD、team domain、应用密码与 token；值不得进入 Git、知识库或聊天。
4. Cloudflare Access owner 创建应用和策略后，再执行真实远端 smoke；本轮不自动创建 DNS、Access 应用或 service token。
