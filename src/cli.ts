#!/usr/bin/env node
import { randomUUID } from "node:crypto";
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
import type {
  AiLinkConfig,
  LoadedConfig,
  ProviderConfig,
  RunResult,
  WorkflowRunResult,
  WorkflowStageResult
} from "./types.js";

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
    case "runs":
      runsCommand(args);
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
  const resume = loadWorkflowResumeState(args, workflow);
  const result = await runWorkflow(loaded.config, {
    workflow,
    stages: parseStageFlags(args),
    previousStages: resume?.stages,
    startAtStage: stringFlag(args, "from-stage") ?? stringFlag(args, "start-at"),
    resumeFromRecordId: resume?.id,
    approvedStages: arrayFlag(args, "approve-stage"),
    approveAll: booleanFlag(args, "approve-all"),
    input,
    system: stringFlag(args, "system"),
    provider: stringFlag(args, "provider"),
    model: stringFlag(args, "model"),
    dryRun: booleanFlag(args, "dry-run"),
    allowSensitive: booleanFlag(args, "allow-sensitive")
  });

  if (booleanFlag(args, "json")) {
    writeStructuredOutput(args, result);
    writeRunRecord(args, {
      kind: "workflow",
      workflow,
      stages: parseStageFlags(args),
      input,
      result
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printWorkflowResult(result);
  writeStructuredOutput(args, result);
  writeRunRecord(args, {
    kind: "workflow",
    workflow,
    stages: parseStageFlags(args),
    input,
    result
  });
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
    allowSensitive: booleanFlag(args, "allow-sensitive"),
    approvePolicy: booleanFlag(args, "approve-policy") || booleanFlag(args, "approve")
  });

  if (booleanFlag(args, "json")) {
    writeStructuredOutput(args, result);
    writeRunRecord(args, {
      kind: "run",
      task,
      input,
      result
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`AI Link result`);
  console.log(`Task: ${result.task}`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Model: ${result.model ?? "(default)"}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  if (result.approval) {
    console.log(`Approval: ${formatApprovalCell(result.approval)}${result.approval.reason ? ` (${result.approval.reason})` : ""}`);
  }
  console.log("");
  console.log(result.output);
  writeStructuredOutput(args, result);
  writeRunRecord(args, {
    kind: "run",
    task,
    input,
    result
  });
}

function runsCommand(args: ParsedArgs): void {
  const subcommand = args.positional[1] ?? "list";
  if (subcommand === "list") {
    listRunRecordsCommand(args);
    return;
  }
  if (subcommand === "show") {
    showRunRecordCommand(args);
    return;
  }
  throw new AiLinkError("Usage: ai-link runs <list|show> [id]", "CLI_USAGE");
}

function listRunRecordsCommand(args: ParsedArgs): void {
  const index = readRunRecordIndex(getRunRecordIndexPath());
  const limit = positiveIntegerFlag(args, "limit") ?? 10;
  const records = index.records.slice(0, limit);

  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify({
      schemaVersion: index.schemaVersion,
      updatedAt: index.updatedAt,
      count: index.records.length,
      records
    }, null, 2));
    return;
  }

  if (records.length === 0) {
    console.log("No AI Link run records found.");
    console.log("Create one with: ai-link workflow run auto_ops --dry-run --record");
    return;
  }

  console.table(records.map((record) => ({
    id: record.id,
    kind: record.kind,
    target: record.workflow ?? record.task ?? "",
    dryRun: record.dryRun ? "yes" : "no",
    createdAt: record.createdAt,
    path: record.path
  })));
}

function showRunRecordCommand(args: ParsedArgs): void {
  const selector = args.positional[2] ?? stringFlag(args, "id");
  if (!selector) {
    throw new AiLinkError("Usage: ai-link runs show <id>", "CLI_USAGE");
  }

  const { record, targetPath } = readRunRecordBySelector(selector);
  if (booleanFlag(args, "json")) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  printRunRecord(record, path.relative(process.cwd(), targetPath).replaceAll("\\", "/"));
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
        dryRun: !live,
        approvePolicy: live
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

function positiveIntegerFlag(args: ParsedArgs, name: string): number | undefined {
  const value = stringFlag(args, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed.toString() !== value) {
    throw new AiLinkError(`--${name} must be a positive integer.`, "CLI_USAGE");
  }
  return parsed;
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

interface WorkflowResumeState {
  id: string;
  stages: WorkflowStageResult[];
}

function loadWorkflowResumeState(args: ParsedArgs, workflow: string): WorkflowResumeState | undefined {
  const selector = stringFlag(args, "resume-from") ?? stringFlag(args, "resume");
  if (!selector) {
    return undefined;
  }

  const { record } = readRunRecordBySelector(selector);
  if (record.kind !== "workflow") {
    throw new AiLinkError("Only workflow run records can be used with --resume-from.", "WORKFLOW_RESUME_INVALID");
  }

  const result = isRecord(record.result) ? record.result : undefined;
  if (!result || result.workflow !== workflow) {
    throw new AiLinkError(
      `Resume record does not belong to workflow "${workflow}".`,
      "WORKFLOW_RESUME_MISMATCH"
    );
  }

  const stages = Array.isArray(result.stages)
    ? result.stages.map(toWorkflowStageResult).filter((stage): stage is WorkflowStageResult => Boolean(stage))
    : [];

  if (stages.length === 0) {
    throw new AiLinkError("Resume record has no workflow stages.", "WORKFLOW_RESUME_INVALID");
  }

  return {
    id: stringValue(record.id) || selector,
    stages
  };
}

function toWorkflowStageResult(value: unknown): WorkflowStageResult | undefined {
  if (!isRecord(value) || !isRecord(value.result)) {
    return undefined;
  }
  const name = stringValue(value.name);
  const task = stringValue(value.task);
  const inputFrom = value.inputFrom === "original" || value.inputFrom === "previous" || value.inputFrom === "original-and-previous"
    ? value.inputFrom
    : "original-and-previous";
  const result = value.result as unknown as RunResult;
  if (!name || !task || !stringValue(result.output)) {
    return undefined;
  }
  return {
    name,
    task,
    inputFrom,
    result,
    approval: isWorkflowStageApprovalResult(value.approval) ? value.approval : undefined,
    source: value.source === "resume" ? "resume" : "current"
  };
}

function isWorkflowStageApprovalResult(value: unknown): value is NonNullable<WorkflowStageResult["approval"]> {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.required === "boolean"
    && typeof value.approved === "boolean"
    && typeof value.enforced === "boolean"
    && (value.mode === "always" || value.mode === "live");
}

interface RunRecordInput {
  kind: "run" | "workflow";
  task?: string;
  workflow?: string;
  stages?: string[];
  input?: string;
  result: RunResult | WorkflowRunResult;
}

interface RunRecordIndexEntry {
  id: string;
  path: string;
  createdAt: string;
  kind: "run" | "workflow";
  task?: string;
  workflow?: string;
  dryRun: boolean;
}

interface RunRecordIndex {
  schemaVersion: 1;
  updatedAt: string;
  records: RunRecordIndexEntry[];
}

function writeRunRecord(args: ParsedArgs, recordInput: RunRecordInput): void {
  if (!booleanFlag(args, "record") && !booleanFlag(args, "record-run")) {
    return;
  }

  const now = new Date();
  const id = `${formatTimestamp(now)}-${safeRecordName(recordInput.workflow ?? recordInput.task ?? recordInput.kind)}-${randomUUID().slice(0, 8)}`;
  const relativePath = path.join("runtime", "tmp", "ai-link-runs", `${id}.json`);
  const targetPath = path.resolve(process.cwd(), relativePath);
  const dryRun = "dryRun" in recordInput.result ? Boolean(recordInput.result.dryRun) : false;
  const record = {
    schemaVersion: 1,
    id,
    createdAt: now.toISOString(),
    kind: recordInput.kind,
    command: recordInput.kind === "workflow" ? "workflow run" : "run",
    request: {
      task: recordInput.task,
      workflow: recordInput.workflow,
      stages: recordInput.stages?.length ? recordInput.stages : undefined,
      provider: stringFlag(args, "provider") ?? stringFlag(args, "model-provider"),
      model: stringFlag(args, "model"),
      dryRun,
      inputLength: recordInput.input?.length ?? 0,
      inputStored: false,
      outputPath: stringFlag(args, "output") ?? stringFlag(args, "output-file")
    },
    audit: buildRunRecordAudit(recordInput.result),
    result: recordInput.result
  };

  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  updateRunRecordIndex({
    id,
    path: relativePath.replaceAll("\\", "/"),
    createdAt: record.createdAt,
    kind: recordInput.kind,
    task: recordInput.task,
    workflow: recordInput.workflow,
    dryRun
  });

  if (!booleanFlag(args, "json")) {
    console.log(`Run record saved to ${relativePath.replaceAll("\\", "/")}.`);
  }
}

function updateRunRecordIndex(entry: RunRecordIndexEntry): void {
  const indexPath = getRunRecordIndexPath();
  const existing = readRunRecordIndex(indexPath);
  const records = [entry, ...existing.records.filter((record) => record.id !== entry.id)].slice(0, 50);
  const index: RunRecordIndex = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    records
  };
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function buildRunRecordAudit(result: RunResult | WorkflowRunResult): Record<string, unknown> {
  if ("stages" in result) {
    return {
      kind: "workflow",
      workflow: result.workflow,
      dryRun: result.dryRun,
      stages: result.stages.map((stage) => ({
        name: stage.name,
        task: stage.task,
        source: stage.source ?? "current",
        approval: summarizeApproval(stage.approval),
        result: buildRunResultAudit(stage.result)
      }))
    };
  }

  return buildRunResultAudit(result);
}

function buildRunResultAudit(result: RunResult): Record<string, unknown> {
  return {
    kind: "run",
    task: result.task,
    provider: result.provider,
    providerType: result.metadata.providerType,
    model: result.model,
    dryRun: result.dryRun,
    policy: result.metadata.policy,
    allowOutbound: result.metadata.allowOutbound,
    policyDataClass: result.metadata.policyDataClass,
    policyAuditTags: result.metadata.policyAuditTags,
    policyBudget: result.metadata.policyBudget,
    usageEstimate: result.metadata.usageEstimate,
    approval: summarizeApproval(result.approval)
  };
}

function summarizeApproval(value: unknown): Record<string, unknown> | undefined {
  if (!isWorkflowStageApprovalResult(value)) {
    return undefined;
  }

  return {
    required: value.required,
    approved: value.approved,
    enforced: value.enforced,
    mode: value.mode,
    reason: value.reason
  };
}

function getRunRecordsDir(): string {
  return path.resolve(process.cwd(), "runtime", "tmp", "ai-link-runs");
}

function getRunRecordIndexPath(): string {
  return path.join(getRunRecordsDir(), "index.json");
}

function resolveRunRecordPath(selector: string): string | undefined {
  const directPath = path.resolve(process.cwd(), selector);
  if (selector.endsWith(".json")) {
    return isRunRecordFileTarget(directPath) && existsSync(directPath) ? directPath : undefined;
  }

  const index = readRunRecordIndex(getRunRecordIndexPath());
  if (selector === "latest") {
    const latest = index.records[0];
    if (!latest) {
      return undefined;
    }
    const latestPath = path.resolve(process.cwd(), latest.path);
    return isRunRecordFileTarget(latestPath) && existsSync(latestPath) ? latestPath : undefined;
  }

  const matches = index.records.filter((record) => record.id === selector || record.id.startsWith(selector));
  if (matches.length > 1) {
    throw new AiLinkError(`Run record selector is ambiguous: ${selector}`, "RUN_RECORD_AMBIGUOUS");
  }
  const match = matches[0];
  if (!match) {
    return undefined;
  }

  const targetPath = path.resolve(process.cwd(), match.path);
  return isRunRecordFileTarget(targetPath) && existsSync(targetPath) ? targetPath : undefined;
}

function readRunRecordBySelector(selector: string): { record: Record<string, unknown>; targetPath: string } {
  const targetPath = resolveRunRecordPath(selector);
  if (!targetPath) {
    throw new AiLinkError(`Run record not found: ${selector}`, "RUN_RECORD_NOT_FOUND");
  }
  const record = JSON.parse(readFileSync(targetPath, "utf8")) as Record<string, unknown>;
  return { record, targetPath };
}

function isRunRecordFileTarget(targetPath: string): boolean {
  if (path.basename(targetPath) === "index.json" || !targetPath.endsWith(".json")) {
    return false;
  }
  const relative = path.relative(getRunRecordsDir(), targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function readRunRecordIndex(indexPath: string): RunRecordIndex {
  if (!existsSync(indexPath)) {
    return { schemaVersion: 1, updatedAt: "", records: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as Partial<RunRecordIndex>;
    if (parsed.schemaVersion === 1 && Array.isArray(parsed.records)) {
      return {
        schemaVersion: 1,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        records: parsed.records.filter(isRunRecordIndexEntry)
      };
    }
  } catch {
    return { schemaVersion: 1, updatedAt: "", records: [] };
  }

  return { schemaVersion: 1, updatedAt: "", records: [] };
}

function isRunRecordIndexEntry(value: unknown): value is RunRecordIndexEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<RunRecordIndexEntry>;
  return typeof entry.id === "string"
    && typeof entry.path === "string"
    && typeof entry.createdAt === "string"
    && (entry.kind === "run" || entry.kind === "workflow")
    && typeof entry.dryRun === "boolean";
}

function formatTimestamp(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-");
}

function safeRecordName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "record";
}

function printRunRecord(record: Record<string, unknown>, relativePath: string): void {
  const request = isRecord(record.request) ? record.request : {};
  const result = isRecord(record.result) ? record.result : {};
  const kind = typeof record.kind === "string" ? record.kind : "(unknown)";

  console.log("AI Link run record");
  console.log(`ID: ${typeof record.id === "string" ? record.id : "(unknown)"}`);
  console.log(`Kind: ${kind}`);
  console.log(`Created: ${typeof record.createdAt === "string" ? record.createdAt : "(unknown)"}`);
  console.log(`Path: ${relativePath}`);
  if (typeof request.workflow === "string") {
    console.log(`Workflow: ${request.workflow}`);
  }
  if (typeof request.task === "string") {
    console.log(`Task: ${request.task}`);
  }
  console.log(`Dry run: ${request.dryRun === true ? "yes" : "no"}`);
  console.log(`Input stored: ${request.inputStored === true ? "yes" : "no"}`);
  console.log(`Input length: ${typeof request.inputLength === "number" ? request.inputLength : 0}`);
  if (typeof request.outputPath === "string") {
    console.log(`Output file: ${request.outputPath}`);
  }

  if (Array.isArray(result.stages)) {
    console.log("");
    console.table(result.stages.map((stage) => {
      const stageRecord = isRecord(stage) ? stage : {};
      const stageResult = isRecord(stageRecord.result) ? stageRecord.result : {};
      return {
        stage: stringValue(stageRecord.name),
        task: stringValue(stageRecord.task),
        provider: stringValue(stageResult.provider),
        model: stringValue(stageResult.model),
        inputFrom: stringValue(stageRecord.inputFrom),
        approval: formatApprovalCell(stageRecord.approval)
      };
    }));
    return;
  }

  if (typeof result.provider === "string") {
    console.log(`Provider: ${result.provider}`);
    if (typeof result.model === "string") {
      console.log(`Model: ${result.model}`);
    }
    if (typeof result.output === "string") {
      console.log("");
      console.log(firstLine(result.output));
    }
  }
}

function formatApprovalCell(value: unknown): string {
  if (!isWorkflowStageApprovalResult(value)) {
    return "";
  }
  if (!value.enforced) {
    return `${value.mode}:dry-run`;
  }
  return value.approved ? `${value.mode}:approved` : `${value.mode}:pending`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (result.resume) {
    console.log(`Resume: ${result.resume.fromRecordId ?? "(record)"} -> ${result.resume.startAtStage}`);
    console.log(`Resume stages: ${result.resume.previousStageCount}`);
  }

  for (const [index, stage] of result.stages.entries()) {
    console.log("");
    console.log(`[${index + 1}] ${stage.name}`);
    console.log(`Source: ${stage.source ?? "current"}`);
    if (stage.approval) {
      const status = stage.approval.enforced
        ? (stage.approval.approved ? "approved" : "pending")
        : "dry-run";
      console.log(`Approval: ${stage.approval.mode}:${status}${stage.approval.reason ? ` (${stage.approval.reason})` : ""}`);
    }
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
  ai-link run <task> [--input text] [--provider name] [--model name] [--dry-run] [--approve-policy] [--json] [--output runtime/tmp/result.json] [--record]
  ai-link workflow run <workflow> [--stages research,article_draft] [--dry-run] [--json] [--output runtime/tmp/result.json] [--record]
  ai-link workflow run <workflow> --resume-from <record-id> [--from-stage stage] [--record]
  ai-link workflow run <workflow> [--approve-stage stage|--approve-all]
  ai-link runs list [--limit 10] [--json]
  ai-link runs show <id|latest> [--json]
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
