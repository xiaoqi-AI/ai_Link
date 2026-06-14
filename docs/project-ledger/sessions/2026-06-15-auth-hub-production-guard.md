# 2026-06-15 授权中枢生产门禁与后续规划

## 本次推进

- 授权中枢新增应用侧 Cloudflare Access origin guard，支持校验 Access header/JWT，并保留应用内登录作为第二层门禁。
- 本地执行器和远端 smoke 脚本支持 Cloudflare Access Service Auth header，便于穿过 `voice.xiao-qi-ai.com` 的 Access 门禁连接 Render。
- 部署检查脚本新增生产模式 Access 必填项校验，缺少 AUD tag、team domain/issuer 或 origin guard 时会失败。
- 新增 `npm run auth-hub:secrets:new`，用于生成生产随机密码和 token；工具只输出到当前终端，不写入文件。
- 新增授权中枢后续规划草案，拆分生产门禁、真实微信/朱雀连接器、内容工作流、多平台扩展和治理运维阶段。

## 安全边界

- 公开仓只记录环境变量名、流程、mock 能力和脱敏说明。
- 真实 secret、Cloudflare Service Auth 凭据、平台登录态、二维码、Cookie、截图和原始平台内容仍不得进入 Git 或知识库镜像。
- 真实连接器和登录 profile 继续放在私有仓或 `runtime/private/` 边界内推进。

## 下一步建议

- 在 Render/Cloudflare 上配置生产变量和 Access policy 后，先执行远端 mock smoke。
- 确认 Bitwarden 是否作为 Render 生产变量和 Cloudflare Service Auth 凭据的统一托管层。
- 第一批真实连接器建议优先验证：微信取材、朱雀AI检测、公众号草稿。
