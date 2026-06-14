# Contributing

感谢关注 `ai_Link`。项目当前处于初始化阶段，欢迎优先提交文档、问题描述、使用场景和维护建议。

## 提交 issue

请优先使用 `.github/ISSUE_TEMPLATE/` 中的模板：

- Bug report：反馈异常或不符合预期的行为。
- Feature request：提出功能建议或使用场景。
- Documentation update：指出文档不清楚、过期或缺失的地方。

不要在公开 issue 中提交 token、账号、二维码、登录态、私密截图、个人财务或交易信息。

## 提交 PR

提交 PR 前请确认：

- 改动范围清楚。
- 文档或用户指引已同步更新。
- 相关检查已运行。
- 没有提交敏感信息、构建产物、缓存或日志。

推荐本地检查：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-governance.ps1
```

## 文档优先级

公开仓库的说明必须跟着功能一起更新。影响用户入口、命令、限制、流程或反馈方式的改动，请同步更新 `README.md`、`docs/user-guide.md` 或治理文档。

