import type { AiLinkConfig } from "../types.js";

export const DEFAULT_CONFIG: AiLinkConfig = {
  version: 1,
  defaults: {
    provider: "mock",
    policy: "default"
  },
  providers: {
    mock: {
      type: "mock",
      model: "mock-echo",
      capabilities: ["text", "structured_output"]
    },
    "openai-compatible": {
      type: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "OPENAI_COMPATIBLE_API_KEY",
      model: "replace-with-provider-model",
      capabilities: ["text", "structured_output"]
    },
    deepseek: {
      type: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      model: "deepseek-v4-pro",
      capabilities: ["text", "code_reasoning", "structured_output"]
    },
    kimi: {
      type: "kimi",
      baseUrl: "https://api.moonshot.ai/v1",
      apiKeyEnv: "MOONSHOT_API_KEY",
      model: "kimi-k2.6",
      capabilities: ["text", "long_context", "structured_output"]
    },
    grok: {
      type: "grok",
      baseUrl: "https://api.x.ai/v1",
      apiKeyEnv: "XAI_API_KEY",
      model: "grok-4.3",
      capabilities: ["text", "web_research", "image_understanding"]
    },
    coze: {
      type: "coze",
      model: "coze-agent-workflow",
      capabilities: ["agent_workflow"]
    }
  },
  routes: {
    "auto_ops.research": {
      provider: "grok",
      capabilities: ["web_research", "text"],
      fallback: ["deepseek", "kimi", "mock"]
    },
    "auto_ops.article_draft": {
      provider: "kimi",
      capabilities: ["long_context", "text"],
      fallback: ["deepseek", "mock"]
    },
    "auto_ops.agent_flow": {
      provider: "coze",
      capabilities: ["agent_workflow"],
      fallback: ["mock"]
    },
    "image.followup": {
      provider: "mock",
      capabilities: ["text", "code_reasoning"]
    }
  },
  workflows: {
    auto_ops: {
      description: "Research with Grok, draft with Kimi, then run the configured agent workflow while Codex keeps execution control.",
      stages: [
        {
          name: "research",
          task: "auto_ops.research",
          inputFrom: "original"
        },
        {
          name: "article_draft",
          task: "auto_ops.article_draft",
          inputFrom: "original-and-previous"
        },
        {
          name: "agent_flow",
          task: "auto_ops.agent_flow",
          inputFrom: "original-and-previous",
          approval: {
            required: true,
            mode: "live",
            reason: "Agent workflow stages may call external tools or platform automations."
          }
        }
      ]
    }
  },
  policies: {
    default: {
      blockSensitive: true,
      allowOutbound: "user-approved"
    }
  }
};
