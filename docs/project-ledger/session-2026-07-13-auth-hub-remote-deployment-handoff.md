# Auth Hub 远程部署人工交接

日期：2026-07-13

状态：逐屏中文手册、决策卡和回滚边界已完成；真实 Render / Cloudflare 资源尚未创建，等待上游 PR 合并链和负责人明确批准。

## 背景

Auth Hub 状态中枢已经具备任务、审批、连接器状态、执行器、Cloudflare Access 源站校验和数据生命周期能力。下一阶段要把本地控制台部署为远程后台，但这会引入持续费用、公网 DNS、身份策略、生产密钥和数据库恢复责任，不能由代码迭代顺带执行。

本轮目标是把远程化从工程配置转成负责人可以逐屏执行和逐项决策的交接，不创建收费资源、不修改 DNS、不接触真实平台登录态。

## 完成内容

- 在 `docs/20-architecture/auth-hub-deployment-checklist.md` 增加部署前决策卡。
- 明确推荐域名、区域、Web / Postgres 规格、浏览器允许账号、Service Auth、密钥存放、Render 原生子域名、自动清理和备份/PITR 十项决策。
- 给出 Cloudflare Access 应用、精确邮箱策略和 Service Auth token 的逐屏顺序。
- 给出应用密钥生成和保存边界，所有示例保持占位符，不记录真实值。
- 给出 Render Blueprint 资源核对、同区要求、`sync: false` 变量和私网数据库合同。
- 给出 Render Custom Domain、Cloudflare CNAME、DNS only 证书验证、`Full` TLS 和 Proxied 切换顺序。
- 给出生产静态预检、Service Auth API/执行器 smoke、Access 正反向验收和日志脱敏要求；浏览器身份与服务身份分开取证。
- 给出代码、访问、执行器、密钥和数据库五类回滚动作；禁止用公开 Bypass 或删除数据库快速止血。
- 修复 remote smoke 将 Service Auth 误当作浏览器身份的问题；自动 smoke 明确跳过浏览器登录并保留人工验收项。
- `remote:next` 在最终 Proxied 状态下使用本机临时 Service Auth 凭据检查 `/healthz`，不输出凭据值。
- Service Auth 凭据只允许发送到批准的 HTTPS Auth Hub 域名，请求不跟随重定向；本地回环 smoke 不携带该凭据。
- Access gate 只接受 Cloudflare Access 登录跳转或可识别边缘页面，不再把普通 `401` / `403` 当作通过。
- 本地执行器优先使用显式参数和环境变量；远程 HTTPS 缺少 executor token 时拒绝启动，不回退开发凭据；已有执行器与新目标或 ID 不一致时非零退出。
- Blueprint 显式固定受限项目客户端 scope，避免把可提交任务和追加审计的 token 误称为纯只读 token。

## 验证结果

- 完整自动化测试通过：核心测试 74 项、Auth Hub 测试 201 项，共 275 项；其中远程部署门禁行为测试 13/13 通过。
- TypeScript 类型检查通过；公开仓敏感扫描通过 386 个文件；npm 包内容检查 36/36 通过。
- 本地 Auth Hub 完整链路 smoke 通过：登录、任务创建、受限 Codex 读取、执行器心跳、人工批准、执行器完成和审计读取均成功。
- 三个 PowerShell 运维脚本语法解析通过；目标切换行为验证确认，已有执行器目标不一致时拒绝假成功。
- Access gate 行为验证确认：源站应用 guard 的 `403` 不算边缘拦截证据，Cloudflare Access 登录重定向才算通过。
- 生产静态预检按预期保持 NO-GO：测试变量齐全时仅因 Web/Postgres region、正式 `domains` 和 `renderSubdomainPolicy: disabled` 尚未编码而失败。
- `auth-hub:remote:next:json` 按预期保持未就绪，不会把尚未部署的域名、缺失的生产变量或未批准 Blueprint 当作可上线。

## 当前建议

- 独立域名使用 `auth.xiao-qi-ai.com`。
- Render 使用 `singapore`，Web 为 Starter 单实例，Postgres 为 `basic-256mb`。
- 浏览器只允许负责人明确批准的完整邮箱。
- 本地执行器允许一个可单独撤销的 Service Auth token。
- 初始密钥使用 Render Secrets 和负责人掌握的本机密码库，后续再迁移统一 secret manager。
- 首次生产 Blueprint 禁用 Render 原生子域名，只保留 Cloudflare Access 后的专用域名入口。
- 首次上线不自动执行 retention；先 dry-run，首次 apply 前验证备份或 PITR 并记录恢复点时间。

## 价值

- 远程后台可以让 ParentingGame、Hermes Agent 和其他项目提交受控任务、查看脱敏状态并等待人工审批。
- 真实平台登录态继续留在本地执行器，不需要每个项目保存 Cookie、二维码或浏览器 Profile。
- Service Auth 有效期内，本地执行器可以重复连接远程中枢，不需要每次让负责人重新登录；失效时只撤销单个凭据。
- 逐屏手册把收费、域名、身份和恢复门禁放在创建资源之前，降低上线后返工和误公开风险。

## 风险与停止条件

- 堆叠 PR 尚未全部合并到 `main` 时停止创建 Blueprint。
- 自动 smoke、浏览器验收和边缘拦截证据未分别通过时停止切换正式入口。
- 区域、规格、允许邮箱或 Service Auth 未确认时停止创建资源。
- `render.yaml` 未编码一致 region、`domains: [auth.xiao-qi-ai.com]` 和 `renderSubdomainPolicy: disabled` 时，生产预检与远程就绪报告保持失败。
- Cloudflare Access 没有精确 Allow 策略、AUD 或 team domain/issuer 时生产进程必须失败关闭。
- Render 证书未验证前不切 Proxied；Proxied 后必须同时验证 Access 和应用内登录。
- 日志出现 token、Cookie、Access JWT、数据库连接串或平台原始响应时立即停止、撤销凭据并回滚。
- 没有已验证备份/PITR 恢复点时不执行 retention apply。

## 下一步人工门禁

1. 负责人确认堆叠 PR 的合并顺序和逐个合并授权。
2. 负责人确认部署决策卡的十项取值。
3. 代码链进入 `main` 后，再按逐屏手册创建 Cloudflare Access、Service Auth、Render Blueprint 和 DNS。
4. 部署后只跑 mock 远程 smoke；真实平台登录、发布和数据清理继续作为独立批准事项。

## 参考

- 部署手册：`docs/20-architecture/auth-hub-deployment-checklist.md`
- 数据生命周期：`docs/20-architecture/auth-hub-data-lifecycle.md`
- Draft PR：https://github.com/xiaoqi-AI/ai_Link/pull/28
