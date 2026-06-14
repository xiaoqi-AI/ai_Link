# 2026-06-15 BWS 本机项目 ID Profile

## 变更

- 新增 `tools/new-bws-local-profile.ps1`，生成本机 PowerShell profile 片段。
- 新增 `npm run bws:profile`，默认写入 `runtime/tmp/bws-local-profile.ps1`。
- 新增 `npm run bws:profile:print`，只打印 profile 片段，不写文件。
- 新增 `npm run bws:profile:from-bws`，在当前会话已有 `BWS_ACCESS_TOKEN` 时按 manifest 项目名读取 Bitwarden project ID。
- fresh clone 验证和 BWS acceptance report 都纳入 `bws:profile:print`。

## 安全边界

- profile 只保存 `AI_LINK_BWS_PROJECT_ID` 和 `AI_LINK_BWS_CI_PROJECT_ID`。
- `BWS_ACCESS_TOKEN` 不写入 profile、不写入项目目录、不进入 Git 或知识库。
- 输出文件限制在 `runtime/tmp/`，属于本机忽略目录。

## 下一步

- 用户创建 Bitwarden 项目后，使用 `npm run bws:profile:from-bws` 自动生成本机会话加载片段，或手动传入两个 project ID。
- 加载 profile 后运行 `npm run bws:session`，通过隐藏输入 token 做严格验收。
