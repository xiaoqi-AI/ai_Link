# 2026-06-15 Public User Onboarding

## 本次推进

- 新增 `src/onboarding/index.ts`，生成公开用户一页式入场引导。
- 新增 `ai-link onboard` CLI 子命令；`npm run onboard` 默认写入 `runtime/tmp/ai-link-onboarding.md`。
- 新增 `npm run onboard:print` / `ai-link onboard --print`，只打印引导内容，不写文件。
- 新增 `npm run onboard:json` / `ai-link onboard --json`，输出机器可读入场状态。
- 新增 `npm run onboard:check` / `ai-link onboard --json --strict`，用于 CI 或其他 agent 用退出码判定入场状态。
- fresh clone 验证已加入 `npm run onboard:print`、`npm run onboard:json` 和 `npm run onboard:check`，覆盖新用户克隆后的第一入口。
- README、用户指南和 auto-ops 示例已补充 `onboard:print` 与 `skill draft --diff --json` 路径。

## 安全边界

- 普通 onboarding 不读取 API key、token、`.env`、登录状态、provider 响应或本机绝对路径。
- 默认只输出公开配置快照、dry-run 命令、自然语言 skill 草稿预览路径和收尾检查。
- 严格模式仅依据公开入口检查的 `fail` / `warn` 状态返回非零退出码，不触发真实 provider 调用。
- 需要真实 provider key 时，继续转入 BWS 密钥托管路径；普通 onboarding 不负责接收或保存密钥。
- 默认写入目标限定在 `runtime/tmp/`，该目录不进入 Git。

## 后续建议

- 后续可以把 `ai-link onboard --json` 接入 UI 或其他 agent 的入场状态检查。
