# 2026-06-15 Workflow 运行记录续跑

## 本次变化

- `workflow run` 支持 `--resume-from <id|latest>`，从本地 workflow 运行记录中读取已有阶段结果。
- 支持 `--from-stage <stage>` / `--start-at <stage>`，用于从指定阶段继续或重跑。
- 续跑结果会标记阶段来源：`resume` 表示来自本地记录，`current` 表示本次新执行。
- fresh clone 验证纳入“先记录 research，再从 latest 续跑剩余阶段”的流程。

## 使用边界

- 续跑只读取 `runtime/tmp/ai-link-runs/` 下的本地记录。
- 运行记录仍属于本地运行态，不提交 Git、不进入知识库、不贴到公开 issue 或 PR。
- 如果记录已经包含 workflow 的全部阶段，默认不会重复执行；需要重跑时显式传入 `--from-stage`。

## 示例

```powershell
npm run ai-link -- workflow run auto_ops --dry-run --stages research --input "公开任务说明" --record
npm run ai-link -- workflow run auto_ops --dry-run --resume-from latest --input "公开任务说明"
npm run ai-link -- workflow run auto_ops --dry-run --resume-from latest --from-stage article_draft
```
