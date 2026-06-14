# GitHub Branch Protection 建议

状态：待在 GitHub UI 配置。当前可用 `npm run github:safety` 做本地基线检查；如果本机安装并登录了 `gh`，脚本还会只读核验远端 branch protection、secret scanning 和 push protection。

配置前可运行 `npm run github:hardening` 生成 `runtime/tmp/github-hardening-worksheet.md`。该工作单列出 GitHub UI 入口、branch protection/ruleset 建议、required `Verify`、secret scanning、push protection 和配置后的验收证据，不会修改 GitHub 远端设置。

## 建议保护对象

- 仓库：`xiaoqi-AI/ai_Link`
- 分支：`main`

## 建议规则

1. Require a pull request before merging。
2. Require status checks to pass before merging。
3. Required checks：
   - `Verify`
4. Require branches to be up to date before merging。
5. Restrict force pushes。
6. Restrict deletions。
7. 启用 secret scanning 和 push protection。

## 可选规则

- Require linear history。
- Require signed commits。
- Require conversation resolution before merging。
- 为 `ai_Link-internal` 私有仓建立独立规则。

## 配置后验证

配置完成后，在本地运行：

```powershell
npm run github:safety
npm run github:safety:json
npm run github:hardening
npm run github:hardening:json
npm run verify:fresh
npm run security:scan
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-knowledge-mirror.ps1
powershell -ExecutionPolicy Bypass -File tools/verify-knowledge-mirror.ps1
```

GitHub UI 中确认最近一次 `main` push 的 `CI / Verify` 为绿色。
