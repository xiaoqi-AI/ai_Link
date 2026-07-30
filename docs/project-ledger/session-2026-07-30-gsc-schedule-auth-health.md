# 2026-07-30 GSC schedule auth health

## Context

ParentingGame 的公开 SEO 检查已经恢复正常：robots、sitemap、canonical、noindex 和公开 URL 抓取条件均通过。但 AI Link 的 GSC 私有只读检查仍报告 `gsc_oauth_refresh_failed`，且本机授权文件存在容易让 `gsc:schedule:plan` 只显示 `credentialReady=true`，造成“凭据文件存在”等同于“授权可用”的误读。

## Change

- `tools/install-gsc-monitor-task.ps1` 保留 `credentialReady` 兼容字段，同时新增 `credentialHealth`、`credentialFile`、`latestCheck`、`operatorAction` 和 `applyReady`。
- 计划任务预览会读取最近一次脱敏 GSC 检查 JSON，只使用稳定错误码判断是否出现 `gsc_oauth_refresh_failed` 或 `gsc_property_not_listed`。
- 当最近检查已证明授权失效时，`-Apply` 失败关闭，不注册一个会持续失败的 Windows 计划任务。
- `docs/20-architecture/google-search-console-connector.md` 和 `docs/user-guide.md` 补充 `credentialReady` 与 `credentialHealth` 的区别。

## Evidence

- `npm.cmd run gsc:schedule:plan` 输出 `credentialHealth=oauth_refresh_failed`、`applyReady=false` 和恢复授权操作建议。
- `powershell -ExecutionPolicy Bypass -File tools\install-gsc-monitor-task.ps1 -Apply` 在已知授权失效时失败关闭。
- `npm.cmd run check`
- `npm.cmd run test`：249 个用例通过。
- `npm.cmd run security:scan`
- `npm.cmd run package:check`
- `powershell -ExecutionPolicy Bypass -File tools\check-governance.ps1`
- `powershell -ExecutionPolicy Bypass -File tools\sync-knowledge-mirror.ps1`
- `powershell -ExecutionPolicy Bypass -File tools\verify-knowledge-mirror.ps1`
- `git diff --check`

## Remaining manual gate

需要维护者在本机恢复 Google Search Console 只读 OAuth 授权：

```powershell
cd D:\codex_workplace\ai_Link
npm.cmd run gsc:recover -- -ProxyUrl "http://127.0.0.1:4780" -ManualCallbackUrl
```

如果浏览器无法回到 loopback，只能把最终 `127.0.0.1` 回调 URL 粘贴到本机终端，不得粘贴到聊天、issue、PR、知识库或公开仓。
