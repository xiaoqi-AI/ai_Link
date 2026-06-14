# 存储、同步与 Git 策略

## 真源

- 本地工作区：`G:\codex_workpace\ai_Link`
- 个人知识库镜像：`D:\llm-wiki\wiki\projects\ai_Link`
- GitHub 远端：待授权后创建或绑定

多电脑协作时，GitHub 远端应成为项目真源；知识库镜像用于长期上下文和会话交接，不代替 Git。

## GitHub 初始化建议

建议使用：

- owner：`xiaoqi-AI`
- repo：`ai_Link`
- visibility：private
- branch：`main`

当前 GitHub CLI 未登录时，只能完成本地 Git 初始化，不能创建远端仓库或推送。

## 提交范围

可以提交：

- 项目文档
- 源码
- 测试
- 小型配置
- 已脱敏的会话摘要和治理记录

禁止提交：

- `.env*`
- token、key、证书、二维码、登录态
- 未脱敏截图或私密资料
- 个人财务或交易信息
- `runtime/private/`
- `node_modules/`、构建产物、缓存、日志

## 换电脑前

1. 运行本地检查。
2. 同步知识库镜像。
3. 提交有意义的进度。
4. 推送到 GitHub。
5. 确认 `ahead 0 / behind 0`。

## 新电脑接手

1. 克隆 GitHub 仓库。
2. 阅读 `README.md`、`AGENTS.md`、`docs/00-governance/`。
3. 检查 `D:\llm-wiki` 是否存在。
4. 运行治理检查和必要安装脚本。
5. 再开始功能开发。

