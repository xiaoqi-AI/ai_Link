# 2026-06-16 迭代边界上下文更新

## Summary

将“迭代边界”明确为 AI Link 每轮开发前的需求和预期约束，而不是单纯版本路线图。该约束用于控制目标模型协作下的过渡开发风险，避免 token 滥用、范围膨胀、公共仓臃肿和偏离用户真实需求。

## Project Context

- AI Link 后续每轮实质开发前，应先明确本轮需求、预期开发工作、验证方式和边界控制。
- 本轮没有进入需求的能力，默认只记录为候选，不顺手实现。
- 当开发中发现预期不符，应先暂停扩张、说明偏差、给出选择，再由用户确认是否扩围。
- 真实 provider、Bitwarden、GitHub UI、provider-live、发布渠道、真实 connector 和 Auth Hub 云端化都属于人工门禁或独立迭代，不应被普通功能开发顺带推进。

## Boundary

- v0.1 当前应优先保持本地 MVP、mock/dry-run、公开安全文档和验证脚本稳定。
- 不因目标模型输出而提前承诺 SDK、真实平台 connector、大型中台抽象、生产授权系统或自动发布能力。
- 如果某项工作需要跨 router、providers、skills、policies、Auth Hub、release 和 external provider 三个以上子系统，应拆成新迭代并重新确认边界。

## Verification Expectation

- 窄范围改动：相关测试、配置校验、Git diff 范围检查。
- 公开行为改动：`npm run check`、相关测试、`npm run security:scan`，并同步 README / docs。
- 发布或外部集成改动：`npm test`、`npm run release:readiness:json`、`npm run external:preflight:json`，真实外部动作等待人工确认。

## Safety

不要把 API key、token、Bitwarden value、登录态、二维码、截图、真实 provider 响应、平台账号内容或 `runtime/private` 写入公开仓、知识库镜像或交接文本。
