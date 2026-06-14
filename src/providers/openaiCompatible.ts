import { AiLinkError } from "../errors.js";
import type {
  ChatMessage,
  ProviderAdapter,
  ProviderCallInput,
  ProviderCallResult
} from "../types.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export const openAiCompatibleProvider: ProviderAdapter = {
  async run(input: ProviderCallInput): Promise<ProviderCallResult> {
    const apiStyle = input.provider.apiStyle ?? "chat-completions";
    const endpoint = resolveEndpoint(input.provider.baseUrl, input.provider.endpoint, apiStyle);
    const messages = buildMessages(input);

    if (input.dryRun) {
      return {
        output: [
          `[dry-run:${input.providerName}]`,
          `would call: ${endpoint}`,
          `apiStyle: ${apiStyle}`,
          `model: ${input.model}`,
          `messages: ${messages.length}`
        ].join("\n"),
        metadata: {
          endpoint,
          apiStyle,
          model: input.model,
          messageCount: messages.length
        }
      };
    }

    const apiKey = resolveApiKey(input);
    const body = buildBody(input, apiStyle, messages);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.provider.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(input.provider.headers ?? {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const raw = await response.json().catch(async () => ({
        text: await response.text().catch(() => "")
      }));

      if (!response.ok) {
        throw new AiLinkError(
          `${input.providerName} request failed with HTTP ${response.status}`,
          "PROVIDER_HTTP_ERROR",
          raw
        );
      }

      return {
        output: extractOutput(raw),
        raw,
        metadata: {
          endpoint,
          apiStyle,
          model: input.model,
          status: response.status
        }
      };
    } catch (error) {
      if (error instanceof AiLinkError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AiLinkError(`${input.providerName} request failed: ${message}`, "PROVIDER_ERROR");
    } finally {
      clearTimeout(timeout);
    }
  }
};

function resolveEndpoint(baseUrl: string | undefined, endpoint: string | undefined, apiStyle: string): string {
  if (endpoint) {
    return endpoint;
  }
  if (!baseUrl) {
    throw new AiLinkError("Provider baseUrl is required.", "PROVIDER_CONFIG_ERROR");
  }

  const normalized = baseUrl.replace(/\/+$/, "");
  const suffix = apiStyle === "responses" ? "/responses" : "/chat/completions";
  return normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`;
}

function resolveApiKey(input: ProviderCallInput): string {
  if (input.provider.apiKey) {
    return input.provider.apiKey;
  }
  if (input.provider.apiKeyEnv) {
    const value = process.env[input.provider.apiKeyEnv];
    if (value) {
      return value;
    }
  }
  throw new AiLinkError(
    `${input.providerName} requires an API key. Set ${input.provider.apiKeyEnv ?? "provider.apiKey"}.`,
    "PROVIDER_AUTH_MISSING"
  );
}

function buildMessages(input: ProviderCallInput): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (input.request.system) {
    messages.push({ role: "system", content: input.request.system });
  }
  messages.push(...(input.request.messages ?? []));
  if (input.request.input) {
    messages.push({ role: "user", content: input.request.input });
  }
  if (messages.length === 0) {
    messages.push({ role: "user", content: `Run task: ${input.request.task}` });
  }
  return messages;
}

function buildBody(
  input: ProviderCallInput,
  apiStyle: string,
  messages: ChatMessage[]
): Record<string, unknown> {
  if (apiStyle === "responses") {
    return {
      model: input.model,
      input: messages,
      ...(input.provider.requestDefaults ?? {})
    };
  }

  return {
    model: input.model,
    messages,
    stream: false,
    ...(input.provider.requestDefaults ?? {})
  };
}

function extractOutput(raw: unknown): string {
  if (isRecord(raw)) {
    const outputText = raw.output_text;
    if (typeof outputText === "string") {
      return outputText;
    }

    const choices = raw.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0];
      if (isRecord(first)) {
        const message = first.message;
        if (isRecord(message) && typeof message.content === "string") {
          return message.content;
        }
        if (typeof first.text === "string") {
          return first.text;
        }
      }
    }
  }

  return JSON.stringify(raw, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
