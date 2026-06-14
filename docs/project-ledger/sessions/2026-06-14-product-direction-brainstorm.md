# 2026-06-14 产品方向头脑风暴

## 目标

沉淀 `ai_Link` 的第一阶段产品方向草案，但不将未确认设想升级为正式计划。

## 已确认草案

- 公开产品名：AI Link。
- 命令行名称：`ai-link`。
- 核心模块名称：`router`、`providers`、`skills`、`policies`。
- 一句话定位：AI Link 让 Codex 能按任务链接合适的模型、Agent 和工作流。
- 第一版主要服务 Codex 本地工作流，同时提供公开可复用能力。
- 第一版不急着做 SDK。
- 支持模型接入，也支持扣子等 Agent / workflow 平台接入。
- 配置优先级：会话临时指定 > 项目 local 私有配置 > 项目公开配置 > 用户全局配置 > 默认配置。

## 文档落点

- 产品方向草案：`docs/10-product/ai-link-product-direction-draft.md`
- 待确认问题：`docs/00-governance/open-questions.md`

## 风险边界

- 当前内容是头脑风暴草案，不代表已完成或正式承诺的功能。
- API key、私有 endpoint、内部策略、供应商评价和未脱敏资料不能进入公开仓。
- 外部模型或 Agent 默认不直接获得本地命令执行权；Codex 负责总控和落地。

## 待确认

- 公开许可证。
- 首批必须跑通的 provider。
- `ai-link` 技术栈、安装方式和命令格式。
- Codex skill 调用 AI Link 的具体约定。
- 扣子接入方式。
