# Auth Hub 远程部署就绪收口

日期：2026-07-13

状态：实现、本地回归、新鲜克隆和 GitHub CI 已完成；草稿 PR #25 等待上游堆叠 PR 与人工审查。尚未创建付费资源、部署远端或执行真实账号验证。

## 需求

- 用户目标：让 Auth Hub 远程化在进入 Render、Cloudflare 人工配置前，具备可信的生产默认值和失败关闭门禁。
- 成功标准：Render Postgres 可由蓝图创建且只允许私网访问；生产进程缺少 `DATABASE_URL` 时拒绝启动；远程 smoke 缺少关键凭据时不能返回成功；service token 不被蓝图静默启用。
- 输入材料：PR #24 的远程身份安全加固、Render 官方 Blueprint 规范、现有部署检查和远程 smoke。
- 输出形态：`render.yaml`、配置加载、部署检查、远程就绪报告、自动化测试、部署手册和项目台账。
- 非目标：创建 Render 服务、数据库、DNS、Cloudflare Access 应用或真实 secret；选择不可变 region；真实 Postgres 集成测试；CSRF、登录限流和数据清理任务。
- 用户确认点：专用域名、region、service token、会话时长、数据库付费规格和真实远程 smoke 仍需负责人批准。

## 实现

- 将 Render Postgres 从不可新建的旧 `starter` 规格改为当前 `basic-256mb`，并设置 `ipAllowList: []`。
- Web Service 只在关联 CI checks 通过后自动部署；Cloudflare service-token 许可改为 `sync: false`，由部署负责人显式决定。
- 生产 `loadConfig` 把 `DATABASE_URL` 纳入必填项，禁止重启即丢任务、审批和审计的内存存储退化。
- 部署预检验证数据库必填、当前 plan、私网入口、自动部署策略和 service-token 显式配置。
- 远程 smoke 缺少应用密码、Admin token 或受限 Codex token 时记为失败；仍强制清空私有 connector 模块。
- README、用户手册和架构文档同步说明价值、风险、部署顺序和人工门禁。

## 已完成验证

- 定向远程安全与就绪测试：10 项通过。
- 项目全量测试：核心 74 项、Auth Hub 168 项，共 242 项通过。
- 包边界检查：36 项通过。
- 安全扫描：372 个文件通过。
- 高危依赖审计：0 个漏洞。
- 包安装 smoke：16 项通过。
- 本地部署预检：0 个失败；仅提示未注入本地生产变量。
- 纯测试值生产预检：0 个失败；未连接真实数据库或远程环境。
- 本地远程形态完整 smoke：14 项通过，`full_chain` mock 任务完成，审批、受限权限和脱敏审计链路正常。
- 缺凭据失败路径：按预期返回失败，应用密码和 Admin token 缺失不会被降级为警告。
- 服务清理：本地 Auth Hub 已停止，测试端口确认关闭。
- 新鲜克隆复验：通过，干净副本重新安装、构建和完整验证耗时约 182 秒。
- 知识库镜像已同步并核验。
- 草稿 PR [#25](https://github.com/xiaoqi-AI/ai_Link/pull/25) 已创建，远端 Git 树与本地最终树一致，GitHub CI `Verify` 通过。

## 待完成验证

- 实际 Render/Postgres/Cloudflare Access 建立后，用独立测试数据执行真实远程 smoke。

## 边界控制

- 范围边界：只解决会导致生产数据丢失、蓝图无法创建、数据库公网暴露或 smoke 假阳性的部署就绪问题。
- 成本边界：本轮不创建付费资源，不产生外部调用费用。
- 安全边界：所有测试使用本地占位值；真实 secret 不进入命令输出、Git、文档或知识库。
- 权限边界：不修改 Render、Cloudflare 或 DNS 账号设置。
- 停止条件：需要不可逆 region 选择、真实数据库、付费确认或远程账号权限时，停止并交给负责人决策。
- 偏差处理：CSRF、登录限流、数据保留执行器和真实 Postgres 并发测试进入后续独立迭代，不在本轮顺手扩张。
