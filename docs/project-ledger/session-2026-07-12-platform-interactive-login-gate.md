# 2026-07-12 平台交互登录审批门禁

## 背景

平台授权连接器 P0.2 需要从公开合同走向真实平台协作，但 `begin_login` 会打开本机可见浏览器，可能涉及扫码、验证码、账号风控和登录态。因此它不能被 Hermes、定时任务或普通 retry 隐式触发。

## 本次决策

- `xiaohongshu/begin_login` 继续作为 `interactive` capability。
- 首次执行 `begin_login` 时，执行器返回 `approval_required`，公开错误码为 `interactive_approval_required`。
- 只有审批通过后，任务才进入 `platform_interactive_login` 步骤，并允许调用受信任的私有连接器方法。
- Auth Hub 的授权/登录状态摘要同时合并 `action_required` 和 `approval_required`，项目负责人可以看到哪些平台需要人工处理或批准。

## 边界

- 未新增真实小红书登录实现。
- 未提交 Cookie、二维码、浏览器 Profile、账号详情、截图、token 或原始平台响应。
- 未把远程 Auth Hub、Bitwarden 或公众号 P0.3 纳入本轮。

## 验收

- 未批准时，`begin_login` 不调用私有连接器。
- 审批通过后，任务进入 `platform_interactive_login` 并调用私有连接器。
- `/api/auth-status` 能把待批准交互登录汇总为平台关注项。
