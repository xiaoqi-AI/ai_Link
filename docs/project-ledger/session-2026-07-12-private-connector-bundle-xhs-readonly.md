# 私有连接器组合与小红书只读适配器

日期：2026-07-12

状态：实现完成，待 GitHub PR 验收

## 背景

GitHub 授权健康检查和公众号官方 API 健康检查此前各自生成一个私有模块，但本地执行器只有一个 `AI_LINK_PRIVATE_CONNECTOR_MODULE` 入口。连续设置变量只会保留最后一个模块，无法形成真实的三平台状态中枢。小红书已有公开合同和交互登录审批门禁，但还缺少能够复用本机私有登录桥的安全命令适配器。

Hermes 当前的小红书桥及其定向测试尚未进入其 Git 历史，不能把未跟踪脚本的参数形式升级为 AI Link 公共契约。本轮因此冻结独立的 JSON stdin/stdout 私有桥合同，不读取 Hermes 登录态、Cookie、Profile 或私有运行文件。

## 本轮决策

- 保留单一 `AI_LINK_PRIVATE_CONNECTOR_MODULE` 入口，新增组合生成器创建 `runtime/private/platform-connectors.mjs`。
- 组合入口按平台整体合并，不做方法级拼接；两个模块声明同一平台时失败关闭，不允许顺序覆盖。
- 小红书适配器只允许 `check_session`、`begin_login`、`search_content`。
- `begin_login` 继续经过 Auth Hub `platform_interactive_login` 审批；未批准不启动私有桥。
- 私有桥必须是 `runtime/private/` 下的 Node `.js` / `.mjs` 文件，调用时固定 `shell=false`。
- 公开结果最多 4 条具体笔记 URL，只保留有限标题、摘要、时间和可达性证据。
- 真实长笔记 URL 使用严格无查询参数白名单通过脱敏；其他长字符串、token 化 URL 和账号字段继续脱敏。
- 平台或桥临时不可用使用 `platform_unavailable`，与明确限流 `platform_rate_limited` 分开。

## 改动

- 新增 `tools/new-private-connector-bundle.js` 和定向测试。
- 新增 `tools/new-xiaohongshu-readonly-private-adapter.js` 和定向测试。
- 修复公众号适配器生成到 `runtime/private` 嵌套目录时的公共模块相对路径。
- 扩展 Auth Hub 公开行动项，支持通用平台不可用状态。
- 更新 README、中文用户手册、连接器合同、产品计划、环境变量示例和变更记录。

## 安全边界

- 生成器不导入私有模块，不读取或打印任何凭据。
- `runtime/private/`、真实桥、Cookie、Profile、二维码和原始响应不进入 Git 或知识库。
- 远端任务不能指定入口模块或桥路径。
- 不实现发布、点赞、评论、关注、私信、验证码规避或无人值守登录。
- 真实小红书账号测试、公众号凭据调用和 Auth Hub 远程域名仍是独立人工门禁。

## 验证

- 私有连接器组合生成器定向测试：6/6 通过，包含三套真实生成模板的单入口加载。
- 小红书适配器定向测试：8/8 通过，包含嵌套目录、超时杀进程和过大输出失败关闭。
- 公众号适配器与小红书适配器联合定向测试：14/14 通过。
- 全量测试：核心/CLI 74 项、Auth Hub 144 项，共 218 项通过。
- TypeScript 检查、npm 包内容检查、安全扫描和治理检查通过。
- fresh-clone 验证通过：干净克隆重新安装依赖、运行全套公开流程和新脚手架打印命令；无私有模块时组合器明确报告缺失并保持零写入。
- 知识库镜像在最终提交内容稳定后同步并验证。

## 后续

1. 审查并安装真实小红书只读桥，按账号、关键词、时间窗和停止条件完成人工验收。
2. 使用组合入口在一个本地执行器中回归 GitHub、公众号和小红书三平台。
3. 完成 Hermes `platform_auth_collect` 消费联调。
4. Auth Hub 远程部署继续等待独立域名确认；推荐使用 `auth.xiao-qi-ai.com`，不覆盖现有业务域名。
