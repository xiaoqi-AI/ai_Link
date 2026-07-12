# 2026-07-12 公众号健康检查私有适配器脚手架

## 迭代边界

### 需求

- 用户目标：继续推进 AI Link 平台授权连接器，使公众号官方 API 的凭据、IP 白名单、限流和服务异常能进入 Auth Hub 的统一人工处理清单。
- 成功标准：公开仓可以生成一个仅位于 `runtime/private/` 的公众号健康检查适配器；离线测试证明它只做只读健康检查、不会回传 access token 或原始响应，并能被现有私有连接器加载器安全加载。
- 输入材料：现有 GitHub 私有适配器脚手架、公众号公开合同、Auth Hub `nextActions`、私有连接器加载器。
- 输出形态：生成器、npm 命令、离线测试、中文使用说明和本账本。
- 非目标：读取真实 AppID/AppSecret、执行真实公众号 API 调用、创建草稿、正式发布、配置公众号后台 IP 白名单、部署 Auth Hub。
- 用户确认点：真实凭据注入与首次官方 API 调用仍是独立人工门禁。

### 预期开发工作

- 预期产物：`wechat_official/check_health` 私有适配器生成器，稳定错误映射，以及 Auth Hub 对公众号限流/不可用状态的下一步行动提示。
- 允许改动：`tools/`、`src/connectors/authStatus.js`、对应测试、`package.json`、fresh-clone 检查和公开文档。
- 明确不碰：`runtime/private/` 既有文件、真实凭据、Hermes/ParentingGame 代码、远程生产环境。
- 实现路径：复用 `MockWechatConnector` 保持内容读取和草稿流程为 mock，仅把 `check_health` 标记为 private；复用 `platform_auth_collect`、`privateLoader` 和公开错误码。
- 工作规模：一个公开脚手架迭代，不新增依赖或服务。

### 验证

- 功能验证：生成器写入/打印模式、路径边界、模块加载、凭据缺失和错误码映射。
- 回归验证：公众号 mock 工作流、Auth Hub 状态、全量测试和 fresh-clone 命令。
- 安全验证：不联网测试；输出不含 AppSecret、access token、原始响应或私有路径；运行公开仓安全扫描。
- 状态验证：GitHub PR、知识库镜像和远端 `main` 对齐。
- 人工验收：本轮不要求真实公众号账号操作。

### 边界控制

- 范围边界：只读健康检查，不扩展草稿或发布能力。
- 成本边界：不产生公众号 API 调用和外部费用。
- 安全边界：凭据只从当前进程环境读取；生成器和报告不得输出凭据值。
- 权限边界：真实调用、IP 白名单和公众号后台设置必须另行确认。
- 停止条件：实现需要保存 access token、上传凭据、修改真实账号或触发外部写操作时立即停止。
- 偏差处理：若官方接口合同与当前公开错误码不一致，先修订合同和测试，不用真实账号试错。

## 完成记录

- 新增 `tools/new-wechat-official-health-private-adapter.js`，支持写入、只打印、JSON 报告、路径边界和显式覆盖。
- 生成的私有模块继承 `MockWechatConnector`：`check_health` 为 `private`，内容读取、草稿、发布和指标保持 `mock`。
- 健康检查使用微信官方稳定 access-token 接口；凭据只从当前进程读取，成功响应中的 access token 和全部原始响应均不进入公开结果。
- 稳定映射 `credential_missing`、`credential_invalid`、`official_api_ip_not_whitelisted`、`official_api_rate_limited` 和 `official_api_unavailable`。
- Auth Hub 已把公众号限流和官方服务不可用纳入 `nextActions`，并保留可重试语义。
- 新增 8 个离线测试，覆盖路径越界、打印模式、私有加载、缺凭据不联网、access token 丢弃、错误码映射、完整任务流和异常可重试语义。
- `npm test` 通过：TypeScript/CLI 74 项、Auth Hub 129 项，共 203 项。
- `npm run check`、`npm run security:scan` 和 `npm run package:check` 通过。
- 本轮没有读取真实 AppID/AppSecret，没有执行公众号 API 调用，没有创建草稿、发布内容或修改远程部署。
