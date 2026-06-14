import { AiLinkError } from "../errors.js";
import type { ProviderAdapter, ProviderConfig } from "../types.js";
import { mockProvider } from "./mock.js";
import { openAiCompatibleProvider } from "./openaiCompatible.js";

export function getProviderAdapter(provider: ProviderConfig): ProviderAdapter {
  switch (provider.type) {
    case "mock":
      return mockProvider;
    case "openai-compatible":
    case "deepseek":
    case "kimi":
    case "grok":
      return openAiCompatibleProvider;
    case "coze":
      throw new AiLinkError(
        "Coze provider is reserved for agent_workflow integration and is not implemented in the MVP runtime yet.",
        "PROVIDER_NOT_IMPLEMENTED"
      );
    default:
      throw new AiLinkError(`Unsupported provider type: ${(provider as ProviderConfig).type}`, "PROVIDER_UNSUPPORTED");
  }
}
