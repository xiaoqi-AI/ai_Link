# 2026-06-15 BWS Rotation Plan

## 变更

- 新增 `tools/new-bws-rotation-plan.ps1`。
- 新增 `npm run bws:rotation`、`npm run bws:rotation:print` 和 `npm run bws:rotation:help`。
- BWS setup plan、onboarding runbook、acceptance report 和 fresh clone 验证纳入 rotation plan 检查。
- README、用户指引和 Bitwarden 密钥托管文档补充 90 天机器账号 token 轮换入口。

## 安全边界

- rotation plan 只记录机器账号名称、项目名、创建日期、复核日期、轮换日期和验证命令。
- 脚本不接收、不保存、不输出真实 token 或 secret value。
- 默认写入 `runtime/tmp/bws-rotation-plan.md`，拒绝写入 `runtime/tmp` 之外的位置。

## 验证

- `npm run bws:rotation:print`
- `npm run bws:acceptance:print`
- `npm run security:scan`

## 下一步

- Bitwarden / GitHub Environment 实配完成后，在首次激活当天生成带 `-TokenCreatedDate` 的轮换计划。
- 轮换执行证据只记录命令结果和日期，不记录任何密钥值。
