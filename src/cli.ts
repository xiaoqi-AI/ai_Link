#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { loadConfig } from "./config/load.js";
import { AiLinkError } from "./errors.js";
import { runAiLink } from "./router/index.js";
import { draftRoutesFromNaturalLanguage } from "./skills/naturalLanguage.js";
import type { AiLinkConfig, LoadedConfig, ProviderConfig } from "./types.js";

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [command] = args.positional;

  switch (command) {
    case "run":
      await runCommand(args);
      return;
    case "providers":
      providersCommand(args);
      return;
    case "config":
      configCommand(args);
      return;
    case "skill":
      skillCommand(args);
      return;
    case "doctor":
      doctorCommand(args);
      return;
    case "version":
    case "--version":
    case "-v":
      console.log("0.1.0");
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      throw new AiLinkError(`Unknown command: ${command}`, "CLI_USAGE");
  }
}

async function runCommand(args: ParsedArgs): Promise<void> {
  const task = args.positional[1];
  if (!task) {
    throw new AiLinkError("Usage: ai-link run <task> [--input text]", "CLI_USAGE");
  }

  const loaded = loadFromArgs(args);
  const input = await readInput(args);
  const result = await runAiLink(loaded.config, {
    task,
    input,
    system: stringFlag(args, "system"),
    provider: stringFlag(args, "provider") ?? stringFlag(args, "model-provider"),
    model: stringFlag(args, "model"),
    dryRun: booleanFlag(args, "dry-run"),
    allowSensitive: booleanFlag(args, "allow-sensitive")
  });

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`AI Link result`);
  console.log(`Task: ${result.task}`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Model: ${result.model ?? "(default)"}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log("");
  console.log(result.output);
}

function providersCommand(args: ParsedArgs): void {
  const subcommand = args.positional[1] ?? "list";
  if (subcommand !== "list") {
    throw new AiLinkError("Usage: ai-link providers list", "CLI_USAGE");
  }

  const loaded = loadFromArgs(args);
  const providers = loaded.config.providers ?? {};
  const rows = Object.entries(providers).map(([name, provider]) => ({
    name,
    type: provider.type,
    model: provider.model ?? "",
    baseUrl: provider.baseUrl ?? "",
    apiKeyEnv: provider.apiKeyEnv ?? "",
    capabilities: provider.capabilities?.join(",") ?? ""
  }));

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.table(rows);
}

function configCommand(args: ParsedArgs): void {
  const subcommand = args.positional[1] ?? "explain";
  if (subcommand !== "explain") {
    throw new AiLinkError("Usage: ai-link config explain", "CLI_USAGE");
  }

  const loaded = loadFromArgs(args);
  const safeConfig = redactConfig(loaded.config);
  const output = {
    priority: [
      "session",
      "project-local",
      "project-public",
      "user-global",
      "default"
    ],
    layers: loaded.layers,
    config: safeConfig
  };

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(stringify(output));
}

function skillCommand(args: ParsedArgs): void {
  const subcommand = args.positional[1];
  if (subcommand !== "draft-route") {
    throw new AiLinkError("Usage: ai-link skill draft-route --description \"...\"", "CLI_USAGE");
  }

  const description = stringFlag(args, "description") ?? args.positional.slice(2).join(" ");
  if (!description) {
    throw new AiLinkError("Missing --description.", "CLI_USAGE");
  }

  const draft = draftRoutesFromNaturalLanguage({
    description,
    skillName: stringFlag(args, "skill") ?? stringFlag(args, "skill-name")
  });

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(draft, null, 2));
    return;
  }
  console.log(stringify(draft));
}

function doctorCommand(args: ParsedArgs): void {
  const loaded = loadFromArgs(args);
  const providers = loaded.config.providers ?? {};
  const rows = Object.entries(providers).map(([name, provider]) => providerHealth(name, provider));

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify({ layers: loaded.layers, providers: rows }, null, 2));
    return;
  }

  console.log("AI Link doctor");
  for (const layer of loaded.layers) {
    console.log(`- ${layer.name}: ${layer.exists ? "found" : "missing"}${layer.path ? ` (${layer.path})` : ""}`);
  }
  console.log("");
  console.table(rows);
}

function providerHealth(name: string, provider: ProviderConfig): Record<string, string> {
  if (provider.type === "mock") {
    return { name, type: provider.type, status: "ready", detail: "local dry-run provider" };
  }
  if (provider.type === "coze") {
    return { name, type: provider.type, status: "reserved", detail: "agent workflow provider placeholder" };
  }
  if (!provider.baseUrl) {
    return { name, type: provider.type, status: "needs-config", detail: "missing baseUrl" };
  }
  if (provider.apiKeyEnv && process.env[provider.apiKeyEnv]) {
    return { name, type: provider.type, status: "ready", detail: provider.apiKeyEnv };
  }
  return {
    name,
    type: provider.type,
    status: "needs-key",
    detail: provider.apiKeyEnv ? `set ${provider.apiKeyEnv}` : "set provider.apiKeyEnv"
  };
}

function loadFromArgs(args: ParsedArgs): LoadedConfig {
  return loadConfig({
    extraConfigPaths: arrayFlag(args, "config")
  });
}

async function readInput(args: ParsedArgs): Promise<string | undefined> {
  const inline = stringFlag(args, "input") ?? stringFlag(args, "i");
  if (inline) {
    return inline;
  }

  const inputFile = stringFlag(args, "input-file");
  if (inputFile) {
    return readFileSync(path.resolve(process.cwd(), inputFile), "utf8");
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    return text || undefined;
  }

  return undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }

    const normalized = arg.replace(/^-+/, "");
    const [name, inlineValue] = normalized.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const isBoolean = inlineValue === undefined && (value === undefined || value.startsWith("-"));

    if (isBoolean) {
      setFlag(flags, name, true);
      continue;
    }

    if (inlineValue === undefined) {
      index += 1;
    }
    setFlag(flags, name, value);
  }

  return { positional, flags };
}

function setFlag(flags: Record<string, string | boolean | string[]>, name: string, value: string | boolean): void {
  if (name in flags) {
    const current = flags[name];
    flags[name] = Array.isArray(current) ? [...current, value.toString()] : [current.toString(), value.toString()];
    return;
  }
  flags[name] = value;
}

function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return typeof value === "string" ? value : undefined;
}

function arrayFlag(args: ParsedArgs, name: string): string[] {
  const value = args.flags[name];
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function booleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}

function redactConfig(config: AiLinkConfig): AiLinkConfig {
  const clone = JSON.parse(JSON.stringify(config)) as AiLinkConfig;
  for (const provider of Object.values(clone.providers ?? {})) {
    if (provider.apiKey) {
      provider.apiKey = "[redacted]";
    }
  }
  return clone;
}

function printHelp(): void {
  console.log(`AI Link

Usage:
  ai-link run <task> [--input text] [--provider name] [--model name] [--dry-run]
  ai-link providers list
  ai-link config explain
  ai-link skill draft-route --description "research with grok, write with kimi"
  ai-link doctor

Configuration priority:
  session > .ai-link/local.yaml > .ai-link/project.yaml > ~/.ai-link/config.yaml > defaults
`);
}

main().catch((error: unknown) => {
  if (error instanceof AiLinkError) {
    console.error(`ai-link: ${error.message}`);
    if (error.details) {
      console.error(JSON.stringify(error.details, null, 2));
    }
    process.exitCode = error.code === "POLICY_BLOCKED" ? 3 : 1;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
