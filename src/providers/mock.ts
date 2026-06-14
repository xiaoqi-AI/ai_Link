import type { ProviderAdapter, ProviderCallInput, ProviderCallResult } from "../types.js";

export const mockProvider: ProviderAdapter = {
  async run(input: ProviderCallInput): Promise<ProviderCallResult> {
    const userInput = input.request.input?.trim() || "(no input)";
    return {
      output: [
        "[mock/local-dry-run]",
        `task: ${input.request.task}`,
        `provider: ${input.providerName}`,
        `model: ${input.model}`,
        `input: ${userInput}`
      ].join("\n"),
      metadata: {
        providerType: "mock",
        model: input.model,
        dryRun: true
      }
    };
  }
};
