# 2026-07-12 GitHub 私有授权适配器脚手架

## 背景

GitHub 平台授权检查合同已经进入公开仓。下一步需要让维护者能在本机安全地生成私有适配器，用当前终端里的 `GH_TOKEN` / `GITHUB_TOKEN` 做只读健康检查，同时不把 token、`gh` 登录态或原始响应写入公开仓。

## 本次增量

- 新增 `tools/new-github-auth-private-adapter.js`。
- 新增命令：
  - `npm run auth-hub:github-adapter:new`
  - `npm run auth-hub:github-adapter:print`
  - `npm run auth-hub:github-adapter:json`
- 生成文件默认路径：
  - `runtime/private/github-auth-adapter.mjs`
- 生成的私有适配器导出 `createPrivateConnectors()`，并提供：
  - `github.checkAuth({ owner, repo, scope })`
- 适配器只读：
  - `GET https://api.github.com/user`
  - `GET https://api.github.com/repos/{owner}/{repo}`

## 安全边界

- 脚手架只允许输出到 `runtime/private/`。
- 不保存、不打印 `GH_TOKEN` / `GITHUB_TOKEN`。
- 不自动修改 GitHub 设置。
- 不合并 PR。
- 不写 GitHub Secrets。
- 不触发 Actions 或 provider-live workflow。
- 不把原始 GitHub 响应回传 Auth Hub。

## 对主目标的推进

- 模块 2：Auth Hub 状态中枢可以通过私有适配器获得 GitHub 授权健康状态。
- 模块 5：平台授权连接器 P0.2 从 GitHub 合同推进到本机真实只读验收准备。
- 模块 6：远程 Auth Hub 后续可以让本地执行器保留真实凭据，远程后台只看脱敏状态。
