# 存储、同步与 Git 策略

## 真源

- 本地工作区：`G:\codex_workpace\ai_Link`
- GitHub 远端：`https://github.com/xiaoqi-AI/ai_Link`
- GitHub 可见性：公开仓库
- 内部私有仓：`https://github.com/xiaoqi-AI/ai_Link-internal`
- 个人知识库镜像：`D:\codex_workplace\llm-wiki\wiki\projects\ai_Link`

多电脑协作时，GitHub 远端是项目真源；知识库镜像用于长期上下文和会话交接，不代替 Git。

## 每次更新的同步要求

1. 修改前检查当前 Git 状态。
2. 修改后运行必要验证。
3. 如果改动影响用户使用、安装、启动、限制条件或协作方式，同步更新用户指引。
4. 同步知识库镜像并校验。
5. 提交到本地 Git。
6. 推送到 GitHub。
7. 确认本地分支与 `origin/main` 对齐。

如果本次改动来自私有内部仓，还要确认：

- 内部来源已记录在 `ai_Link-internal`。
- 公开内容已通过脱敏和用户指引检查。
- 公开仓没有内部路径、内部判断或未确认承诺。

## 公开仓库提交范围

可以提交：

- 项目文档、用户指引和治理记录
- 源码、测试和小型配置
- `.github` 下的 issue/PR 模板
- 已脱敏的会话摘要和决策记录

禁止提交：

- `.env*`
- token、key、证书、二维码、登录态
- `BWS_ACCESS_TOKEN`、`BW_ACCESS_TOKEN` 和任何 Bitwarden machine account access token
- 未脱敏截图或私密资料
- 个人财务或交易信息
- `runtime/private/`
- `node_modules/`、构建产物、缓存、日志

## 公开仓库建议

- `main` 保持可用，尽量避免直接提交未验证的破坏性改动。
- 条件允许时，在 GitHub 设置主分支保护或 ruleset，限制强推和误删。
- 对用户可见的能力变化，维护 `README.md`、`docs/user-guide.md`、issue 模板和 PR 模板。
- 许可证未确认前，不要自动添加 `LICENSE`。

## 换电脑前

1. 运行本地检查。
2. 同步知识库镜像。
3. 提交有意义的进度。
4. 推送到 GitHub。
5. 确认 `ahead 0 / behind 0`。

## 新电脑接手

1. 克隆 GitHub 仓库。
2. 阅读 `README.md`、`AGENTS.md`、`docs/user-guide.md` 和 `docs/00-governance/`。
3. 检查 `D:\codex_workplace\llm-wiki` 是否存在。
4. 如需真实模型或自动化凭据，先进入 BWS 密钥托管模式；只在当前本机会话里设置 `BWS_ACCESS_TOKEN`，然后运行 `tools/check-bitwarden-secrets.ps1`。
5. 运行治理检查和必要安装脚本。
6. 再开始功能开发。
