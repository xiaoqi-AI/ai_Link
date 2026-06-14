# 2026-06-14 MVP 第一版实现

## 目标

按确认方案推进 AI Link MVP 第一版：实现 TypeScript / Node.js 的 `ai-link` CLI，跑通首批 provider，建立配置分层、路由、策略、Codex skill 调用约定和 auto-ops 示例。

## 已实现

- 新增 Apache-2.0 `LICENSE`。
- 建立 TypeScript CLI 工程：`package.json`、`tsconfig.json`、`src/`。
- 新增公开项目配置：`.ai-link/project.yaml`。
- 实现配置加载和优先级：默认配置、用户全局、项目公开、项目 local、会话覆盖。
- 实现 provider adapter 接口。
- 实现 `mock/local-dry-run`。
- 实现 OpenAI-compatible HTTP adapter。
- 通过默认配置支持 `openai-compatible`、`deepseek`、`kimi`、`grok`。
- 实现敏感信息出站扫描策略。
- 实现自然语言 skill 描述生成候选路由。
- 新增 auto-ops 轻量示例。

## 验证

- `npm run check`
- `npm test`
- `npm run ai-link -- doctor`
- `npm run ai-link -- providers list`
- `npm run ai-link -- run provider.test --provider openai-compatible --dry-run --input "hello"`
- `npm run ai-link -- run provider.test --provider deepseek --dry-run --input "hello"`
- `npm run ai-link -- run provider.test --provider kimi --dry-run --input "hello"`
- `npm run ai-link -- run provider.test --provider grok --dry-run --input "hello"`
- `npm run ai-link -- run provider.test --provider mock --input "hello"`

## 风险边界

- 真实外部 provider 调用需要用户本机 API key；公开仓不保存真实密钥。
- `coze` 当前是 Agent / workflow provider 预留，MVP runtime 暂未实现真实调用。
- 工作区曾出现未跟踪的私有服务端实验文件，已通过 `.gitignore` 防止误提交；未纳入本次公开 MVP。

## 待确认

- 是否补充豆包 provider。
- 扣子真实接入方式。
- 是否发布 npm 包。
- auto-ops 是否扩展为完整示例项目。
