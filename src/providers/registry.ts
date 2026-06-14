import { AiLinkError } from "../errors.js";
import type { ProviderAdapter, ProviderConfig } from "../types.js";
import { cozeProvider } from "./coze.js";
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
      return cozeProvider;
    default:
      throw new AiLinkError(`Unsupported provider type: ${(provider as ProviderConfig).type}`, "PROVIDER_UNSUPPORTED");
  }
}
