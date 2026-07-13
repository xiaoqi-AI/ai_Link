#!/usr/bin/env node
import { loadConfig } from "../src/config.js";
import { PostgresStore } from "../src/storage/postgresStore.js";

const argv = process.argv.slice(2);

try {
  if (argv.includes("--help")) {
    console.log(helpText());
  } else {
    const options = parseArgs(argv);
    const config = loadConfig();
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is required; an in-memory preview is not operational retention evidence.");
    }
    const store = new PostgresStore({
      connectionString: config.databaseUrl,
      retention: config.retention
    });
    try {
      const report = await store.runRetentionMaintenance(options);
      console.log(options.json ? JSON.stringify(report, null, 2) : renderMarkdown(report));
    } finally {
      await store.close();
    }
  }
} catch (error) {
  console.error(`auth-hub-retention: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const allowed = new Set(["--json", "--apply", "--confirm-backup", "--actor", "--max-rows"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!allowed.has(arg)) throw new Error(`Unsupported argument: ${arg}`);
    if (["--actor", "--max-rows"].includes(arg)) index += 1;
  }
  const apply = args.includes("--apply");
  const backupConfirmed = args.includes("--confirm-backup");
  if (backupConfirmed && !apply) {
    throw new Error("--confirm-backup is only valid together with --apply.");
  }
  if (apply && !backupConfirmed) {
    throw new Error("--apply requires --confirm-backup after a backup or PITR restore point is verified.");
  }
  const maxRowsValue = valueAfter(args, "--max-rows");
  const maxRowsPerTable = maxRowsValue === "" ? undefined : Number(maxRowsValue);
  if (maxRowsValue !== "" && (!Number.isInteger(maxRowsPerTable) || maxRowsPerTable < 1 || maxRowsPerTable > 1000)) {
    throw new Error("--max-rows must be an integer between 1 and 1000.");
  }
  return {
    apply,
    backupConfirmed,
    actor: valueAfter(args, "--actor") || "maintenance:cli",
    maxRowsPerTable,
    json: args.includes("--json")
  };
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function renderMarkdown(report) {
  const lines = [
    "# AI Link Auth Hub Retention",
    "",
    `Mode: ${report.mode}`,
    `As of: ${report.asOf}`,
    `Policy version: ${report.policyVersion}`,
    `Has more: ${report.hasMore ? "yes" : "no"}`,
    "",
    "| Resource | Candidates | Changed |",
    "| --- | ---: | ---: |"
  ];
  for (const name of Object.keys(report.candidates)) {
    lines.push(`| ${name} | ${report.candidates[name]} | ${report.changed[name]} |`);
  }
  lines.push(
    "",
    `Recovery boundary: ${report.recoveryBoundary}`,
    "",
    `Protected resources: ${report.protectedResources.join(", ")}`,
    "",
    report.mode === "dry-run"
      ? "No data was changed. Review this preview before any apply run."
      : "The bounded batch was committed and a maintenance audit event was recorded."
  );
  return `${lines.join("\n")}\n`;
}

function safeErrorMessage(error) {
  return String(error?.message || "Retention maintenance failed.")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replace(/(token|password|secret)=([^\s&]+)/gi, "$1=[redacted]");
}

function helpText() {
  return `AI Link Auth Hub retention maintenance

Usage:
  npm run auth-hub:retention
  npm run auth-hub:retention:json
  npm run auth-hub:retention -- --apply --confirm-backup --actor maintenance:operator

The default mode is a read-only dry-run. Apply mode requires an existing verified
backup or PITR restore point and processes at most one bounded batch per table.
`;
}
