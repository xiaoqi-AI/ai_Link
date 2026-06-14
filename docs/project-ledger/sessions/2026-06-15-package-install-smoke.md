# Package Install Smoke

日期：2026-06-15

## 背景

`package:check` 已能用 `npm pack --dry-run` 验证包内容，但它不能证明用户从 tarball 安装后 `ai-link` CLI 能正常启动。v0.1 发布前需要一个更贴近真实 npm 用户体验、但不发布到 npm 的安装 smoke。

## 本次推进

- 新增 `tools/check-package-install.js`。
- 新增脚本：
  - `npm run package:install-smoke`
  - `npm run package:install-smoke:json`
- 脚本流程：
  - 使用当前构建产物创建本地 tarball。
  - 在系统临时目录创建空 consumer project。
  - 安装本地 tarball，使用 `--ignore-scripts --no-audit --no-fund`。
  - 运行安装后的 `ai-link --version`。
  - 运行安装后的 `ai-link config validate`。
- CI、fresh clone、onboarding、release readiness、release plan、README、用户指南和发布流程均纳入该检查。

## 边界

该检查只在本地和系统临时目录操作，不发布 npm 包，不读取密钥，不触发真实 provider 调用。临时目录默认自动删除；如需排查，可设置 `AI_LINK_KEEP_PACKAGE_INSTALL_SMOKE=1` 保留。

## 后续

如果用户决定发布 npm 包，仍需先确认 npm owner、账号、2FA、access policy 和 rollback 策略，再执行 `npm publish --dry-run --access public`。
