import { spawn } from "node:child_process";
import { AiLinkError } from "../errors.js";
import type { ProviderAdapter, ProviderCallInput, ProviderCallResult } from "../types.js";

const DEFAULT_TIMEOUT_MS = 120_000;

export const cozeProvider: ProviderAdapter = {
  async run(input: ProviderCallInput): Promise<ProviderCallResult> {
    const payload = buildPayload(input);

    if (input.dryRun) {
      return {
        output: [
          `[dry-run:${input.providerName}]`,
          "agent provider: coze",
          `commandConfigured: ${input.provider.command ? "yes" : "no"}`,
          `argsCount: ${(input.provider.args ?? []).length}`,
          `model: ${input.model}`,
          `task: ${input.request.task}`
        ].join("\n"),
        metadata: {
          providerType: "coze",
          model: input.model,
          commandConfigured: Boolean(input.provider.command)
        }
      };
    }

    if (!input.provider.command) {
      throw new AiLinkError(
        `${input.providerName} requires provider.command in local or user config before live agent execution.`,
        "PROVIDER_CONFIG_ERROR"
      );
    }

    const stdout = await runCommand({
      command: input.provider.command,
      args: input.provider.args ?? [],
      payload,
      timeoutMs: input.provider.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });

    const parsed = parseCommandOutput(stdout);
    return {
      output: parsed.output,
      raw: parsed.raw,
      metadata: {
        providerType: "coze",
        model: input.model,
        commandConfigured: true,
        argsCount: (input.provider.args ?? []).length
      }
    };
  }
};

function buildPayload(input: ProviderCallInput): Record<string, unknown> {
  return {
    provider: input.providerName,
    type: input.provider.type,
    task: input.request.task,
    model: input.model,
    input: input.request.input ?? "",
    system: input.request.system ?? "",
    messages: input.request.messages ?? [],
    requestDefaults: input.provider.requestDefaults ?? {}
  };
}

function runCommand(options: {
  command: string;
  args: string[];
  payload: Record<string, unknown>;
  timeoutMs: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new AiLinkError("Coze command timed out.", "PROVIDER_TIMEOUT"));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new AiLinkError(`Coze command failed to start: ${error.message}`, "PROVIDER_ERROR"));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new AiLinkError(`Coze command exited with ${code}${detail ? `: ${detail}` : ""}`, "PROVIDER_ERROR"));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });

    child.stdin.end(`${JSON.stringify(options.payload)}\n`);
  });
}

function parseCommandOutput(stdout: string): { output: string; raw?: unknown } {
  if (!stdout) {
    return { output: "" };
  }

  try {
    const raw = JSON.parse(stdout) as unknown;
    const output = outputFromRecord(raw);
    if (output) {
      return { output, raw };
    }
    return { output: JSON.stringify(raw, null, 2), raw };
  } catch {
    const events = parseJsonLines(stdout);
    for (const event of [...events].reverse()) {
      const output = outputFromRecord(event);
      if (output) {
        return { output, raw: events };
      }
    }
    return { output: stdout };
  }
}

function parseJsonLines(stdout: string): unknown[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return undefined;
      }
    })
    .filter((event): event is unknown => event !== undefined);
}

function outputFromRecord(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of ["output", "content", "reply_content", "replyContent"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  const data = value.data;
  if (isRecord(data)) {
    return outputFromRecord(data);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
