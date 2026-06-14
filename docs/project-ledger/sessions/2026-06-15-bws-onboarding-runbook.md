# 2026-06-15 BWS 入场引导

## 变更

- 新增 `tools/start-bws-onboarding.ps1`，生成不含真实密钥的 BWS 入场引导。
- 新增 `npm run bws:onboard`，默认写入 `runtime/tmp/bws-onboarding.md`。
- 新增 `npm run bws:onboard:print`，只打印入场引导，不写文件。
- fresh clone 验证纳入 `bws:onboard:print`，确保公开仓新克隆也能直接查看下一步。

## 安全边界

- 入场引导只报告 `BWS_ACCESS_TOKEN`、`GH_TOKEN`、`GITHUB_TOKEN` 是否存在，不打印值。
- `AI_LINK_BWS_PROJECT_ID` 和 `AI_LINK_BWS_CI_PROJECT_ID` 只作为非敏感状态展示，不打印具体值。
- 生成文件限制在 `runtime/tmp/`，不会进入 Git 或知识库镜像。

## 下一步

- 用户完成 Bitwarden 项目和 machine account 后，先运行 `npm run bws:onboard` 看当前缺口。
- 本地临时 token 验证使用 `npm run bws:session`。
- GitHub provider-live 配置完成后再运行 `npm run bws:acceptance:strict`。
