#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { deepMerge, loadConfig, readYamlConfig } from "./config/load.js";
import { hasValidationErrors, validateConfig } from "./config/validate.js";
import { AiLinkError } from "./errors.js";
import { runAiLink } from "./router/index.js";
import {
  draftRoutesFromNaturalLanguage,
  draftSkillConfigFromNaturalLanguage
} from "./skills/naturalLanguage.js";
import { runWorkflow } from "./workflows/index.js";
import type { AiLinkConfig, LoadedConfig, ProviderConfig, WorkflowRunResult } from "./types.js";

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
      await providersCommand(args);
      return;
    case "workflow":
      await workflowCommand(args);
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

async function workflowCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positional[1] ?? "run";
  if (subcommand !== "run") {
    throw new AiLinkError("Usage: ai-link workflow run <workflow> [--stages a,b]", "CLI_USAGE");
  }

  const workflow = args.positional[2];
  if (!workflow) {
    throw new AiLinkError("Usage: ai-link workflow run <workflow> [--stages a,b]", "CLI_USAGE");
  }

  const loaded = loadFromArgs(args);
  const input = await readInput(args);
  const result = await runWorkflow(loaded.config, {
    workflow,
    stages: parseStageFlags(args),
    input,
    system: stringFlag(args, "system"),
    provider: stringFlag(args, "provider"),
    model: stringFlag(args, "model"),
    dryRun: booleanFlag(args, "dry-run"),
    allowSensitive: booleanFlag(args, "allow-sensitive")
  });

  if (booleanFlag(args, "json")) {
    writeStructuredOutput(args, result);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printWorkflowResult(result);
  writeStructuredOutput(args, result);
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
    writeStructuredOutput(args, result);
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
  writeStructuredOutput(args, result);
}

async function providersCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positional[1] ?? "list";
  if (subcommand === "verify") {
    await verifyProvidersCommand(args);
    return;
  }
  if (subcommand !== "list") {
    throw new AiLinkError("Usage: ai-link providers <list|verify>", "CLI_USAGE");
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

async function verifyProvidersCommand(args: ParsedArgs): Promise<void> {
  const loaded = loadFromArgs(args);
  const providers = loaded.config.providers ?? {};
  const requested = arrayFlag(args, "provider");
  const live = booleanFlag(args, "live");
  const strict = booleanFlag(args, "strict");
  const input = stringFlag(args, "input") ?? "AI Link provider verification. Reply briefly.";
  const selected = requested.length > 0 ? requested : Object.keys(providers);
  const rows: Array<Record<string, string>> = [];
  let hasFailure = false;

  for (const name of selected) {
    const provider = providers[name];
    if (!provider) {
      hasFailure = true;
      rows.push({
        name,
        type: "",
        mode: live ? "live" : "dry-run",
        status: "failed",
        detail: "provider is not configured"
      });
      continue;
    }

    const skipReason = live ? liveSkipReason(provider) : "";
    if (skipReason) {
      if (strict) {
        hasFailure = true;
      }
      rows.push({
        name,
        type: provider.type,
        mode: "live",
        status: strict ? "failed" : "skipped",
        detail: skipReason
      });
      continue;
    }

    try {
      const result = await runAiLink(loaded.config, {
        task: `provider.verify.${name}`,
        provider: name,
        input,
        dryRun: !live
      });
      rows.push({
        name,
        type: provider.type,
        mode: live ? "live" : "dry-run",
        status: "ok",
        detail: firstLine(result.output)
      });
    } catch (error) {
      hasFailure = true;
      rows.push({
        name,
        type: provider.type,
        mode: live ? "live" : "dry-run",
        status: "failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.table(rows);
  }

  if (hasFailure) {
    process.exitCode = 2;
  }
}

function configCommand(args: ParsedArgs): void {
  const subcommand = args.positional[1] ?? "explain";
  if (subcommand === "validate") {
    validateConfigCommand(args);
    return;
  }
  if (subcommand !== "explain") {
    throw new AiLinkError("Usage: ai-link config <explain|validate>", "CLI_USAGE");
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

function validateConfigCommand(args: ParsedArgs): void {
  const loaded = loadFromArgs(args);
  const issues = validateConfig(loaded.config);
  const output = {
    ok: !hasValidationErrors(issues),
    issues
  };

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(output, null, 2));
  } else if (issues.length === 0) {
    console.log("AI Link config is valid.");
  } else {
    for (const issue of issues) {
      console.log(`[${issue.severity}] ${issue.path}: ${issue.message}`);
    }
  }

  if (hasValidationErrors(issues)) {
    process.exitCode = 2;
  }
}

function skillCommand(args: ParsedArgs): void {
  const subcommand = args.positional[1];
  if (subcommand !== "draft-route" && subcommand !== "draft") {
    throw new AiLinkError("Usage: ai-link skill <draft|draft-route> --description \"...\" [--write path --yes]", "CLI_USAGE");
  }

  const description = stringFlag(args, "description") ?? args.positional.slice(2).join(" ");
  if (!description) {
    throw new AiLinkError("Missing --description.", "CLI_USAGE");
  }

  const options = {
    description,
    skillName: stringFlag(args, "skill") ?? stringFlag(args, "skill-name")
  };
  const draft = subcommand === "draft"
    ? draftSkillConfigFromNaturalLanguage(options)
    : draftRoutesFromNaturalLanguage(options);

  const writeTarget = stringFlag(args, "write");
  if (writeTarget) {
    handleSkillDraftWrite(args, draft, writeTarget);
    return;
  }

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(draft, null, 2));
    return;
  }
  console.log(stringify(draft));
}

function handleSkillDraftWrite(args: ParsedArgs, draft: AiLinkConfig, writeTarget: string): void {
  const targetPath = path.resolve(process.cwd(), writeTarget);
  const renderedDraft = stringify(draft);

  if (!isAllowedSkillDraftTarget(targetPath)) {
    throw new AiLinkError(
      "Refusing to write outside .ai-link/local.yaml or .ai-link/project.yaml.",
      "CONFIG_WRITE_GUARD"
    );
  }

  if (isProjectPublicConfig(targetPath) && !booleanFlag(args, "allow-public-config")) {
    throw new AiLinkError(
      "Refusing to write .ai-link/project.yaml without --allow-public-config. Prefer .ai-link/local.yaml while drafting.",
      "CONFIG_WRITE_GUARD"
    );
  }

  if (!booleanFlag(args, "yes")) {
    console.log(renderedDraft);
    console.log(`# Preview only. Add --yes to merge this draft into ${writeTarget}.`);
    return;
  }

  const existing = existsSync(targetPath) ? readYamlConfig(targetPath) : {};
  const merged = deepMerge(existing, draft);
  const targetDir = path.dirname(targetPath);
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetPath, stringify(merged), "utf8");

  console.log(`AI Link skill draft merged into ${writeTarget}.`);
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
    if (provider.command) {
      return { name, type: provider.type, status: "ready", detail: "local agent command configured" };
    }
    return { name, type: provider.type, status: "dry-run-only", detail: "set provider.command in local config for live agent execution" };
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

function liveSkipReason(provider: ProviderConfig): string {
  if (provider.type === "mock") {
    return "";
  }

  if (provider.type === "coze") {
    return provider.command ? "" : "set provider.command in local config";
  }

  if (provider.baseUrl?.includes("api.example.com")) {
    return "replace placeholder baseUrl before live verification";
  }

  if (provider.apiKey) {
    return "";
  }

  if (!provider.apiKeyEnv) {
    return "provider has no apiKeyEnv configured";
  }

  if (!process.env[provider.apiKeyEnv]) {
    return `set ${provider.apiKeyEnv}`;
  }

  return "";
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.slice(0, 120) ?? "";
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

function parseStageFlags(args: ParsedArgs): string[] {
  return [...arrayFlag(args, "stage"), ...arrayFlag(args, "stages")]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
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

function isProjectPublicConfig(targetPath: string): boolean {
  return targetPath === path.resolve(process.cwd(), ".ai-link", "project.yaml");
}

function isAllowedSkillDraftTarget(targetPath: string): boolean {
  return [
    path.resolve(process.cwd(), ".ai-link", "local.yaml"),
    path.resolve(process.cwd(), ".ai-link", "project.yaml")
  ].includes(targetPath);
}

function writeStructuredOutput(args: ParsedArgs, value: unknown): void {
  const outputPath = stringFlag(args, "output") ?? stringFlag(args, "output-file");
  if (!outputPath) {
    return;
  }

  const targetPath = path.resolve(process.cwd(), outputPath);
  if (!isRuntimeTmpOutputTarget(targetPath)) {
    throw new AiLinkError(
      "Refusing to write structured output outside runtime/tmp. Use --json for stdout consumers.",
      "OUTPUT_WRITE_GUARD"
    );
  }

  if (existsSync(targetPath) && !booleanFlag(args, "force")) {
    throw new AiLinkError(`Output file already exists: ${outputPath}. Add --force to overwrite.`, "OUTPUT_EXISTS");
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  if (!booleanFlag(args, "json")) {
    console.log("");
    console.log(`Structured result saved to ${outputPath}.`);
  }
}

function isRuntimeTmpOutputTarget(targetPath: string): boolean {
  const runtimeTmpPath = path.resolve(process.cwd(), "runtime", "tmp");
  const relative = path.relative(runtimeTmpPath, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function printWorkflowResult(result: WorkflowRunResult): void {
  console.log("AI Link workflow result");
  console.log(`Workflow: ${result.workflow}`);
  console.log(`Stages: ${result.stages.length}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);

  for (const [index, stage] of result.stages.entries()) {
    console.log("");
    console.log(`[${index + 1}] ${stage.name}`);
    console.log(`Task: ${stage.task}`);
    console.log(`Provider: ${stage.result.provider}`);
    console.log(`Model: ${stage.result.model ?? "(default)"}`);
    console.log(`Input: ${stage.inputFrom}`);
    console.log(stage.result.output);
  }
}

function printHelp(): void {
  console.log(`AI Link

Usage:
  ai-link run <task> [--input text] [--provider name] [--model name] [--dry-run] [--json] [--output runtime/tmp/result.json]
  ai-link workflow run <workflow> [--stages research,article_draft] [--dry-run] [--json] [--output runtime/tmp/result.json]
  ai-link providers list
  ai-link providers verify [--live] [--strict] [--provider name]
  ai-link config explain
  ai-link config validate
  ai-link skill draft --description "research with grok, write with kimi" [--write .ai-link/local.yaml --yes]
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
