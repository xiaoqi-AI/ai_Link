# Hermes 项目客户端本地/mock 消费验收

日期：2026-07-20

状态：完成。首个下游项目已经通过安装包级黑盒验收；真实平台调用和远程部署仍未发生。

## 背景

PR #38 已把 `ai-link-auth-hub` 项目客户端、项目身份、own-task 隔离和幂等任务合同合并到 `main`，但当时只有 AI Link 仓内测试和安装烟测，尚不能证明一个业务项目能按公开合同消费完整链路。

用户将主线切换为 ParentingGame 或 Hermes 的本地/mock 项目客户端消费验收，并明确真实 GitHub、小红书、公众号调用，以及 Auth Hub 远程部署、费用、DNS、Access 和生产密钥继续保留人工决策门禁。

## 迭代边界

本轮只选择 Hermes 和 `wechat_official/check_health`：

- 下游从 AI Link 本地源码生成 npm 包，并安装到临时消费者目录。
- 消费方使用安装后的项目客户端，不直接导入 AI Link 源码客户端函数。
- Hub 仅监听 loopback，使用内存存储、一次性项目身份和公开 mock connector。
- 不读取 Hermes 或 AI Link 已有 OAuth、Cookie、平台 token、浏览器 Profile 或私有 connector。
- 不修改 Hermes 现有生产主流程和平台直连兜底。
- 不创建远程服务、数据库、DNS、Access 策略或收费资源。

## 下游产物

Hermes 仓库新增：

- `tools/ai_link_auth_hub_mock_acceptance.py`：完整本地/mock 黑盒验收程序。
- `tests/test_ai_link_auth_hub_consumer.py`：JSON、npm 包元数据、AI Link 根目录和敏感输出保护测试。
- `docs/ai-link-auth-hub-mock-consumer.md`：中文背景、边界、操作和验收手册。

Hermes 主工作区当时存在大量其他未提交内容，因此本轮在独立干净 Git worktree 中实现，只提交上述新增文件，不覆盖或暂存既有改动。

## 验收结果

2026-07-20 Windows 本机黑盒验收单次运行约 1 至 2 分钟，七组检查全部通过：

1. `@xiaoqi-ai/ai-link` 临时包安装成功，安装后的项目客户端入口存在。
2. Hermes 项目身份只获准 `wechat_official/check_health`。
3. 首次提交返回已接受、未就绪和排队状态。
4. 公开 mock 执行器处理同一任务，最终结果为 `completed` 和 `ready`。
5. 相同 `requestId` 重试返回原任务并标记幂等复用。
6. 另一个项目身份读取该任务时返回 `task_not_found`。
7. 未支持的公众号发布操作失败关闭，客户端、执行器和 Hub 输出均未出现一次性测试凭据。

Hermes 单元测试 `7/7` 通过，Python 3.12 语法检查和 Git 差异检查通过；最新完整黑盒运行约 82 秒。环境白名单和独立空 npm 用户/全局配置证明现有平台凭据、npm 登录配置和私有 connector 配置不会传入验收子进程。专用测试入口显式绑定 `127.0.0.1`；构建前后 AI Link `dist` 内容指纹一致，未遗留构建产物变更。

## 结论与价值

AI Link 已从“提供项目客户端代码”推进到“被真实下游仓库按安装包合同消费”。项目身份、任务提交、执行、回读、幂等、隔离和脱敏可以作为其他项目的复用基线；业务项目不需要自己重建 Auth Hub 协议和安全边界。

本结果不代表公众号真实授权有效，也不代表 Auth Hub 已远程部署。下一条推荐主线是 ParentingGame 读取 AI Link GSC 脱敏报告的本地消费验收；它与 Auth Hub 公众号 mock 链路分开实施。

## 保留人工门禁

- 真实 GitHub、小红书和公众号只读调用。
- 任何登录、验证码、扫码、Cookie、OAuth 或 AppSecret 处理。
- 公众号草稿、发布和其他平台写操作。
- Auth Hub 远程部署、Render/Postgres、Cloudflare Access、DNS、费用和生产密钥。
