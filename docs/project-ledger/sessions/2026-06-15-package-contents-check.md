# npm Package Contents 检查

日期：2026-06-15

## 背景

AI Link 是公开 GitHub 仓库，后续可能发布 npm 包。此前 `package.json` 的 `files` 会包含整个 `dist`，而 TypeScript 构建会把 `src/**/*.test.ts` 一并编译到 `dist`，导致 `npm pack --dry-run` 预览包里出现 `dist/**/*.test.js`、测试声明文件和 sourcemap。

这不是密钥泄露，但会让公开包显得不干净，也增加外部用户安装体积和误解成本。

## 本次推进

- 新增 `tsconfig.build.json`，发布构建排除 `src/**/*.test.ts`。
- 新增 `tools/build-runtime.js`，构建前清理 `dist`，避免历史残留测试产物进入打包预览。
- 新增 `tools/check-package-contents.js`：
  - 运行 `npm pack --dry-run --json`。
  - 检查必需文件：`dist/cli.js`、`dist/index.js`、`dist/types.d.ts`、README、LICENSE、关键 docs 和 examples。
  - 检查包面只包含 `dist`、`docs`、`examples`、README、LICENSE 和 `package.json`。
  - 阻止源码、测试、工具、自动化目录、运行态、dotenv 和私有 auth state 文件进入包。
  - 支持 `--json` 供 CI、Codex skill 或其他 agent 读取。
- 新增 `npm run package:check` 和 `npm run package:check:json`。
- `npm test` 改为先构建运行时，再用 `tsx` 直接运行 `src/**/*.test.ts`，不再依赖 `dist` 中的测试文件。
- CI、fresh clone、onboarding、release readiness 和公开文档均纳入 package contents 检查。

## 边界

`package:check` 只做本地 dry-run，不发布到 npm，不读取 API key，不触发真实 provider 调用。

## 后续

在决定是否正式发布 npm 包前，仍需确认：

- 包名、版本策略和 npm owner。
- 是否发布 scoped public package。
- 是否需要减少 docs/project-ledger 在 npm 包内的体积。
- v0.1 tag、CHANGELOG 和 GitHub Release 节奏。
