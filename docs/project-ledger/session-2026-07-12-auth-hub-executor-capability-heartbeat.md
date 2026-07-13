# Auth Hub 执行器能力心跳与状态证据分层

日期：2026-07-12

状态：实现与定向测试完成，待完整验证和 GitHub PR 验收

## 项目背景

AI Link Auth Hub 的服务端 registry 可以描述公开连接器合同，但 GitHub、公众号和小红书私有适配器只加载在本机执行器。此前控制台把服务端 `available` 直接展示成就绪，项目负责人无法判断“代码合同存在”“本机执行器在线”“真实账号/API 可用”分别处于什么状态，也可能让 ParentingGame 或 Hermes Agent 误以为真实平台已经可调用。

本轮不进入真实平台，不读取账号、Cookie、Profile 或凭据，而是先补齐最低风险的运行时可见性。同时审计远程部署配置时确认 `voice.xiao-qi-ai.com` 当前返回的不是 AI Link Auth Hub，不能继续把它写死为远程中枢地址。

## 迭代边界卡

### 需求

- 用户目标：让 Auth Hub 成为可靠的项目状态中心，并继续为 GitHub、公众号和小红书连接器 P0 提供运行时可见性。
- 成功标准：静态合同与执行器运行证据分开；心跳缺失或过期时失败关闭；公开响应不泄露本机或账号资料；远程 mock smoke 不加载私有连接器。
- 输入材料：现有 connector registry、本地执行器、Auth Hub API/存储/控制台、远程部署脚本和 P0 产品计划。
- 输出形态：代码、数据库迁移、测试、中文文档、项目账本和独立 PR。
- 非目标：真实小红书登录/搜索、公众号凭据调用、GitHub token 验收、connector 健康探测、能力感知调度、远程部署、DNS 或 Cloudflare 修改。
- 用户确认点：PR 合并；独立 Auth Hub 域名与授权邮箱；后续真实只读探测的账号、频率、配额和停止条件。

### 预期开发工作

- 允许改动：`src/connectors/`、`src/executor/`、`src/routes/`、`src/storage/`、`src/ui/`、配置、部署检查、测试和公开文档。
- 明确不碰：`runtime/private/`、真实凭据、现有业务域名、Hermes/ParentingGame 代码和平台写操作。
- 实现路径：复用现有 registry 和轮询执行器；不新增依赖、第二套队列、WebSocket 或设备指纹体系。

### 验收方式

- 心跳合同、API scope、内存/Postgres 最新快照、TTL、缺失/过期状态和旧 Hub 兼容测试。
- UI 与跨项目严格状态客户端测试。
- 本地和远程 mock smoke，明确断言私有连接器未加载。
- 全量测试、类型检查、包检查、安全扫描、治理检查、fresh clone 和知识库镜像验证。

### 停止条件

- 一旦实现需要读取私有模块内容、凭据存在性、真实平台响应或账号状态，停止并进入真实探测人工门禁。
- 一旦远程部署会覆盖现有域名、需要生产 secret 或修改 Cloudflare/Render，停止并请求负责人确认。
- 在 executor token、executor identity、lease 和 result 未形成强绑定前，不把心跳用于任务调度或授权。

## 本轮架构决策

1. 状态分为三层：服务端 `contract`、本机 `executor`、真实平台 `probe`，三者互不替代。
2. `GET /api/connectors` 顶层继续返回静态合同，新增 `executorRuntime` 返回执行器证据，避免破坏既有消费者。
3. 执行器在 lease 前 best-effort 上报心跳；心跳失败不阻塞任务，也兼容没有新端点的旧 Hub。
4. 心跳只从内存中的已加载 registry 生成能力白名单，不调用任何 connector 方法。
5. 服务端使用接收时间和可配置 TTL，Postgres 仅保留每个 executor id 的最新快照，不记录高频历史流水。
6. 缺少真实只读 probe 时统一保持 `operationalStatus=unverified`、`canRunReal=false`；静态 `available` 不再等于 `ready`。
7. executor id 当前只是公开标签，不是机器身份认证，因此心跳只用于状态展示，不参与能力感知调度。
8. 远程 smoke 显式清除 `AI_LINK_PRIVATE_CONNECTOR_MODULE`，只验收公开 mock 链路。
9. `render.yaml` 不再写死 `voice.xiao-qi-ai.com`；生产域名必须显式配置。建议候选是 `auth.xiao-qi-ai.com`，仍待人工确认。

## 已完成内容

- 新增执行器心跳 schema、严格规范化、静态/运行时合并和过期策略。
- 新增内存与 Postgres 最新心跳存储，以及独立 `executor:heartbeat` scope。
- 本地执行器启动后自动上报能力，状态文件只记录公开心跳结果。
- 控制台和 API 展示合同基线、执行器 online/stale 和真实平台未验证状态。
- `auth-hub:status:strict` 对 `unverified` 失败关闭，供真正依赖外部平台的项目按需调用。
- 远程部署检查纳入 heartbeat TTL，并阻止误把现有 voice 站点当作 Auth Hub。

## 价值

- 项目负责人能看清“代码支持”与“现在能不能真实调用”的差别，减少错误决策。
- 其他项目只在外部平台任务触发时读取严格状态，不需要每次普通开发都消耗 token 或访问 Auth Hub。
- 本机执行器离线或重启后，远端状态会自然过期，不留下长期伪就绪。
- 为后续低频只读健康探测和远程 Auth Hub 打下可审计基础，又不提前扩大真实账号风险。

## 风险与控制

- 风险：共享 executor token 可以伪造另一个 executor id。控制：当前心跳不参与调度或授权；强身份绑定另立迭代。
- 风险：在线心跳被误解为登录有效。控制：UI、API 和文档都固定显示 `probe=not_run`、`canRunReal=false`。
- 风险：远程 smoke 意外加载真实适配器。控制：脚本显式清除私有模块变量并断言运行模式不为 `private`。
- 风险：高频心跳增加数据库写入。控制：默认随执行器轮询发送、每个 executor id 只保留最新记录，TTL 默认 60 秒。

## 后续人工决策

### 决策 A：合并本轮 PR

- 建议：批准。该 PR 不触发真实平台、不部署远端，只修复状态误报并强化部署护栏。
- 价值：先让状态中心可信，再进行真实账号验收。
- 风险：状态会比以前更保守，部分消费者可能看到 `unverified`；这是预期的失败关闭。

### 决策 B：远程 Auth Hub 域名

- 内容：是否确认使用 `auth.xiao-qi-ai.com`，以及哪些邮箱可通过 Cloudflare Access。
- 建议：使用独立 `auth.xiao-qi-ai.com`，不要覆盖 voice 业务域名。
- 后续动作：负责人确认后再配置 Render、DNS、Access、Postgres 和生产 secrets，并运行 mock-only smoke。

### 决策 C：真实只读探测

- 内容：是否允许对 GitHub `checkAuth`、公众号 `checkHealth`、小红书 `checkSession` 做低频、缓存、只读探测。
- 建议：先完成远程 mock 闭环，再按平台逐个批准；首轮只探测一个平台，设置频率、配额、超时和停止条件。
- 风险：真实 API 配额、平台风控、凭据失效和隐私边界。任何登录、验证码或写操作仍逐次人工处理。

## 下一步

1. 完整验证本分支并创建 PR。
2. PR 合并后，由负责人决定独立域名和 Cloudflare Access 范围。
3. 完成远程 mock-only 部署验收。
4. 另立只读 probe 迭代；在 probe 验收前不声称任何平台真实可运行。
