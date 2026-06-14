import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";

const cliPath = path.resolve("dist", "cli.js");

test("onboard --print renders the public onboarding runbook", () => {
  const result = runCli(process.cwd(), ["onboard", "--print"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /AI Link Public User Onboarding/);
  assert.match(result.stdout, /First Dry-Run Path/);
  assert.match(result.stdout, /skill draft .*--diff --json/);
});

test("onboard --json renders a machine-readable public onboarding report", () => {
  const result = runCli(process.cwd(), ["onboard", "--json"]);
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(output.summary.ok, true);
  assert.equal(output.summary.strictOk, true);
  assert.equal(output.summary.counts.fail, 0);
  assert.equal(output.summary.counts.warn, 0);
  assert.equal(Array.isArray(output.snapshot.providers), true);
  assert.equal(output.snapshot.providers.includes("grok"), true);
  assert.equal(output.snapshot.workflows.includes("auto_ops"), true);
  assert.equal(output.commands.firstDryRunPath.includes("npm run providers:dry"), true);
  assert.match(output.safety.join(" "), /Does not read API keys/);
});

test("onboard --json --strict passes for the repository onboarding contract", () => {
  const result = runCli(process.cwd(), ["onboard", "--json", "--strict"]);
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(output.summary.strictOk, true);
});

test("onboard --strict fails when required public entry checks warn", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-onboard-strict-"));
  try {
    writeFileSync(path.join(tempRoot, "package.json"), JSON.stringify({
      name: "onboard-strict-test",
      version: "0.0.0",
      scripts: { "ai-link": "echo test" }
    }), "utf8");
    mkdirSync(path.join(tempRoot, ".ai-link"), { recursive: true });
    writeFileSync(path.join(tempRoot, ".ai-link", "project.yaml"), "version: 1\nproviders:\n  mock:\n    type: mock\nroutes:\n  demo.task:\n    provider: mock\nworkflows:\n  demo: {}\n", "utf8");

    const result = runCli(tempRoot, ["onboard", "--json", "--strict"]);
    const output = JSON.parse(result.stdout);

    assert.equal(result.status, 2);
    assert.equal(output.summary.ok, true);
    assert.equal(output.summary.strictOk, false);
    assert.equal(output.summary.counts.warn > 0, true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("providers verify --json renders a machine-readable summary report", () => {
  const result = runCli(process.cwd(), ["providers", "verify", "--json"]);
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(output.summary.ok, true);
  assert.equal(output.summary.mode, "dry-run");
  assert.equal(output.summary.strict, false);
  assert.equal(output.summary.counts.failed, 0);
  assert.equal(output.summary.counts.total, output.providers.length);
  assert.equal(output.providers.some((provider: { name: string; status: string }) => provider.name === "grok" && provider.status === "ok"), true);
});

test("providers verify --live --strict --json reports missing provider keys", () => {
  const result = runCli(process.cwd(), [
    "providers",
    "verify",
    "--live",
    "--strict",
    "--provider",
    "grok",
    "--json"
  ], {
    XAI_API_KEY: ""
  });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 2);
  assert.equal(output.summary.ok, false);
  assert.equal(output.summary.mode, "live");
  assert.equal(output.summary.strict, true);
  assert.equal(output.summary.counts.failed, 1);
  assert.equal(output.providers[0].name, "grok");
  assert.equal(output.providers[0].status, "failed");
  assert.match(output.providers[0].detail, /XAI_API_KEY/);
});

test("onboard writes markdown only inside runtime tmp", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-onboard-write-"));
  try {
    writeFileSync(path.join(tempRoot, "package.json"), JSON.stringify({
      name: "onboard-test",
      version: "0.0.0",
      scripts: { "ai-link": "echo test", "providers:dry": "echo test" }
    }), "utf8");
    mkdirSync(path.join(tempRoot, ".ai-link"), { recursive: true });
    writeFileSync(path.join(tempRoot, ".ai-link", "project.yaml"), "version: 1\nproviders:\n  mock:\n    type: mock\nworkflows:\n  demo: {}\n", "utf8");

    const result = runCli(tempRoot, ["onboard", "--output", "runtime/tmp/onboard.md"]);
    const targetPath = path.join(tempRoot, "runtime", "tmp", "onboard.md");

    assert.equal(result.status, 0);
    assert.equal(existsSync(targetPath), true);
    assert.match(readFileSync(targetPath, "utf8"), /AI Link Public User Onboarding/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("onboard refuses writes outside runtime tmp", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-onboard-guard-"));
  try {
    const result = runCli(tempRoot, ["onboard", "--output", "README.md"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside runtime\/tmp/);
    assert.equal(existsSync(path.join(tempRoot, "README.md")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write previews without --yes", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-preview-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      ".ai-link/local.yaml"
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Preview only/);
    assert.equal(existsSync(path.join(tempRoot, ".ai-link", "local.yaml")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write --diff previews merge summary without writing", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-diff-preview-"));
  try {
    const configDir = path.join(tempRoot, ".ai-link");
    const targetPath = path.join(configDir, "local.yaml");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(targetPath, "version: 1\nroutes:\n  auto_ops.research:\n    provider: mock\n", "utf8");

    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok, article draft with Kimi",
      "--write",
      ".ai-link/local.yaml",
      "--diff"
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /# Merge summary/);
    assert.match(result.stdout, /# routes added: auto_ops\.article_draft/);
    assert.match(result.stdout, /# routes updated: auto_ops\.research/);
    assert.match(result.stdout, /# workflows added: auto_ops/);
    assert.match(result.stdout, /Preview only/);
    assert.doesNotMatch(readFileSync(targetPath, "utf8"), /article_draft/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write --diff --json previews machine-readable merge summary without writing", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-json-diff-preview-"));
  try {
    const configDir = path.join(tempRoot, ".ai-link");
    const targetPath = path.join(configDir, "local.yaml");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(targetPath, "version: 1\nroutes:\n  auto_ops.research:\n    provider: mock\n", "utf8");

    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok, article draft with Kimi",
      "--write",
      ".ai-link/local.yaml",
      "--diff",
      "--json"
    ]);
    const output = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(output.target, ".ai-link/local.yaml");
    assert.equal(output.previewOnly, true);
    assert.equal(output.merged, false);
    assert.deepEqual(output.diff.routes.added, ["auto_ops.article_draft"]);
    assert.deepEqual(output.diff.routes.updated, ["auto_ops.research"]);
    assert.deepEqual(output.diff.workflows.added, ["auto_ops"]);
    assert.equal(output.draft.routes["auto_ops.article_draft"].provider, "kimi");
    assert.doesNotMatch(readFileSync(targetPath, "utf8"), /article_draft/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write --yes merges into local config", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-write-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok, article draft with Kimi",
      "--write",
      ".ai-link/local.yaml",
      "--yes"
    ]);

    const targetPath = path.join(tempRoot, ".ai-link", "local.yaml");
    assert.equal(result.status, 0);
    assert.equal(existsSync(targetPath), true);
    const written = readFileSync(targetPath, "utf8");
    assert.match(written, /auto_ops\.research/);
    assert.match(written, /auto_ops\.article_draft/);
    assert.match(written, /workflows:/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write --json --yes writes and prints machine-readable status", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-json-write-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      ".ai-link/local.yaml",
      "--json",
      "--yes"
    ]);
    const output = JSON.parse(result.stdout);

    const targetPath = path.join(tempRoot, ".ai-link", "local.yaml");
    assert.equal(result.status, 0);
    assert.equal(output.previewOnly, false);
    assert.equal(output.merged, true);
    assert.equal(output.target, ".ai-link/local.yaml");
    assert.equal(output.draft.routes["auto_ops.research"].provider, "grok");
    assert.equal("diff" in output, false);
    assert.match(readFileSync(targetPath, "utf8"), /auto_ops\.research/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write --diff --yes writes and prints merge summary", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-diff-write-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      ".ai-link/local.yaml",
      "--diff",
      "--yes"
    ]);

    const targetPath = path.join(tempRoot, ".ai-link", "local.yaml");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /AI Link skill draft merged/);
    assert.match(result.stdout, /# Merge summary/);
    assert.match(result.stdout, /# routes added: auto_ops\.research/);
    assert.equal(existsSync(targetPath), true);
    assert.match(readFileSync(targetPath, "utf8"), /auto_ops\.research/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --diff requires a write target", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-diff-usage-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--diff"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--diff requires --write/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft refuses public project config writes without explicit override", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-public-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      ".ai-link/project.yaml",
      "--yes"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to write/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft refuses writes outside ai-link config files", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-outside-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      "notes.yaml",
      "--yes"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside \.ai-link/);
    assert.equal(existsSync(path.join(tempRoot, "notes.yaml")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("run writes structured output without overwriting by default", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-run-output-"));
  try {
    const outputPath = path.join("runtime", "tmp", "run-result.json");
    const result = runCli(tempRoot, [
      "run",
      "auto_ops.research",
      "--dry-run",
      "--input",
      "fresh output check",
      "--output",
      outputPath
    ]);

    const targetPath = path.join(tempRoot, outputPath);
    assert.equal(result.status, 0);
    assert.equal(existsSync(targetPath), true);
    const written = JSON.parse(readFileSync(targetPath, "utf8"));
    assert.equal(written.task, "auto_ops.research");
    assert.equal(written.dryRun, true);
    assert.match(result.stdout, /Structured result saved/);

    const overwrite = runCli(tempRoot, [
      "run",
      "auto_ops.research",
      "--dry-run",
      "--input",
      "fresh output check",
      "--output",
      outputPath
    ]);
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /Output file already exists/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("workflow run writes structured JSON output for skill handoff", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-workflow-output-"));
  try {
    const outputPath = path.join("runtime", "tmp", "workflow-result.json");
    const result = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--input",
      "fresh workflow output check",
      "--output",
      outputPath
    ]);

    const targetPath = path.join(tempRoot, outputPath);
    assert.equal(result.status, 0);
    assert.equal(existsSync(targetPath), true);
    const written = JSON.parse(readFileSync(targetPath, "utf8"));
    assert.equal(written.workflow, "auto_ops");
    assert.equal(written.stages.length, 3);
    assert.deepEqual(written.stages.map((stage: { name: string }) => stage.name), ["research", "article_draft", "agent_flow"]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("workflow run records local run history without storing original input", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-workflow-record-"));
  try {
    const input = "fresh workflow record check";
    const result = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--input",
      input,
      "--record"
    ]);

    const recordsDir = path.join(tempRoot, "runtime", "tmp", "ai-link-runs");
    const indexPath = path.join(recordsDir, "index.json");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Run record saved/);
    assert.equal(existsSync(indexPath), true);

    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    assert.equal(index.records.length, 1);
    assert.equal(index.records[0].kind, "workflow");
    assert.equal(index.records[0].workflow, "auto_ops");
    assert.match(index.records[0].path, /^runtime\/tmp\/ai-link-runs\/.+\.json$/);

    const recordFiles = readdirSync(recordsDir).filter((name) => name.endsWith(".json") && name !== "index.json");
    assert.equal(recordFiles.length, 1);
    const record = JSON.parse(readFileSync(path.join(recordsDir, recordFiles[0]), "utf8"));
    assert.equal(record.kind, "workflow");
    assert.equal(record.request.inputLength, input.length);
    assert.equal(record.request.inputStored, false);
    assert.equal("input" in record.request, false);
    assert.equal(record.audit.kind, "workflow");
    assert.equal(record.audit.stages.length, 3);
    assert.equal(record.audit.stages[0].result.policy, "default");
    assert.deepEqual(record.audit.stages[0].result.policyAuditTags, ["default-outbound"]);
    assert.equal(record.result.stages.length, 3);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("runs list and show read local run records", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-runs-read-"));
  try {
    const create = runCli(tempRoot, [
      "run",
      "auto_ops.research",
      "--dry-run",
      "--input",
      "fresh run record read check",
      "--record"
    ]);
    assert.equal(create.status, 0);

    const list = runCli(tempRoot, ["runs", "list", "--json"]);
    assert.equal(list.status, 0);
    const index = JSON.parse(list.stdout);
    assert.equal(index.count, 1);
    assert.equal(index.records[0].kind, "run");
    assert.equal(index.records[0].task, "auto_ops.research");

    const show = runCli(tempRoot, ["runs", "show", index.records[0].id, "--json"]);
    assert.equal(show.status, 0);
    const record = JSON.parse(show.stdout);
    assert.equal(record.id, index.records[0].id);
    assert.equal(record.kind, "run");
    assert.equal(record.request.task, "auto_ops.research");
    assert.equal(record.request.inputStored, false);
    assert.equal(record.audit.kind, "run");
    assert.equal(record.audit.policy, "default");
    assert.equal(record.audit.providerType, "grok");
    assert.equal(record.audit.usageEstimate.inputTokens > 0, true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("runs submit-audit posts a local run record audit to auth hub", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-runs-submit-audit-"));
  const requests: Array<{ url: string | undefined; authorization: string | undefined; body: Record<string, unknown> }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body
      });
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({
        auditEvent: {
          id: "audit-1",
          eventType: "ai_link.audit",
          detail: {
            audit: body.audit
          }
        }
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const create = runCli(tempRoot, [
      "run",
      "auto_ops.research",
      "--dry-run",
      "--input",
      "fresh audit submit check",
      "--record"
    ]);
    assert.equal(create.status, 0);

    const index = JSON.parse(runCli(tempRoot, ["runs", "list", "--json"]).stdout);
    const submit = await runCliAsync(tempRoot, [
      "runs",
      "submit-audit",
      index.records[0].id,
      "--task-id",
      "task-123",
      "--base-url",
      baseUrl
    ], {
      AI_LINK_CODEX_TOKEN: "codex-submit-token"
    });

    assert.equal(submit.status, 0);
    assert.match(submit.stdout, /AI Link audit submitted/);
    assert.equal(submit.stdout.includes("codex-submit-token"), false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/tasks/task-123/audit");
    assert.equal(requests[0].authorization, "Bearer codex-submit-token");
    assert.equal(requests[0].body.recordId, index.records[0].id);
    assert.equal(requests[0].body.source, "ai-link-cli");
    assert.equal((requests[0].body.audit as { provider?: string }).provider, "grok");
    assert.equal(JSON.stringify(requests[0].body).includes("fresh audit submit check"), false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("workflow run resumes from a local workflow run record", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-workflow-resume-"));
  try {
    const seed = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--stages",
      "research",
      "--input",
      "fresh workflow resume seed",
      "--record"
    ]);
    assert.equal(seed.status, 0);

    const index = JSON.parse(runCli(tempRoot, ["runs", "list", "--json"]).stdout);
    const resume = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--resume-from",
      index.records[0].id,
      "--input",
      "fresh workflow resume continuation",
      "--json"
    ]);

    assert.equal(resume.status, 0);
    const result = JSON.parse(resume.stdout);
    assert.equal(result.resume.fromRecordId, index.records[0].id);
    assert.equal(result.resume.startAtStage, "article_draft");
    assert.equal(result.resume.previousStageCount, 1);
    assert.deepEqual(
      result.stages.map((stage: { name: string; source: string }) => [stage.name, stage.source]),
      [
        ["research", "resume"],
        ["article_draft", "current"],
        ["agent_flow", "current"]
      ]
    );

    const latest = runCli(tempRoot, ["runs", "show", "latest", "--json"]);
    assert.equal(latest.status, 0);
    assert.equal(JSON.parse(latest.stdout).id, index.records[0].id);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("workflow resume refuses completed records unless a stage is selected", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-workflow-resume-complete-"));
  try {
    const seed = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--input",
      "fresh complete workflow resume seed",
      "--record"
    ]);
    assert.equal(seed.status, 0);

    const index = JSON.parse(runCli(tempRoot, ["runs", "list", "--json"]).stdout);
    const complete = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--resume-from",
      index.records[0].id
    ]);
    assert.notEqual(complete.status, 0);
    assert.match(complete.stderr, /no remaining stages/);

    const rerun = runCli(tempRoot, [
      "workflow",
      "run",
      "auto_ops",
      "--dry-run",
      "--resume-from",
      index.records[0].id,
      "--from-stage",
      "article_draft",
      "--json"
    ]);
    assert.equal(rerun.status, 0);
    const result = JSON.parse(rerun.stdout);
    assert.equal(result.resume.startAtStage, "article_draft");
    assert.deepEqual(
      result.stages.map((stage: { name: string; source: string }) => [stage.name, stage.source]),
      [
        ["research", "resume"],
        ["article_draft", "current"],
        ["agent_flow", "current"]
      ]
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("workflow run requires and accepts explicit stage approval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-workflow-approval-"));
  try {
    const configPath = path.join(tempRoot, "approval.yaml");
    writeFileSync(configPath, [
      "version: 1",
      "providers:",
      "  mock:",
      "    type: mock",
      "    model: mock-echo",
      "routes:",
      "  demo.publish:",
      "    provider: mock",
      "workflows:",
      "  demo:",
      "    stages:",
      "      - name: publish",
      "        task: demo.publish",
      "        approval:",
      "          required: true",
      "          mode: always",
      "          reason: Publish needs review.",
      ""
    ].join("\n"), "utf8");

    const blocked = runCli(tempRoot, [
      "workflow",
      "run",
      "demo",
      "--config",
      configPath,
      "--input",
      "publish this"
    ]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /requires approval/);

    const approved = runCli(tempRoot, [
      "workflow",
      "run",
      "demo",
      "--config",
      configPath,
      "--input",
      "publish this",
      "--approve-stage",
      "publish",
      "--json"
    ]);
    assert.equal(approved.status, 0);
    const result = JSON.parse(approved.stdout);
    assert.equal(result.stages[0].approval.approved, true);
    assert.equal(result.stages[0].approval.enforced, true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("run requires and accepts explicit policy approval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-policy-approval-"));
  try {
    const configPath = path.join(tempRoot, "policy.yaml");
    writeFileSync(configPath, [
      "version: 1",
      "providers:",
      "  mock:",
      "    type: mock",
      "    model: mock-echo",
      "routes:",
      "  demo.agent:",
      "    provider: mock",
      "    policy: external_action",
      "policies:",
      "  external_action:",
      "    approval:",
      "      required: true",
      "      mode: live",
      "      reason: External action needs review.",
      ""
    ].join("\n"), "utf8");

    const blocked = runCli(tempRoot, [
      "run",
      "demo.agent",
      "--config",
      configPath,
      "--input",
      "execute"
    ]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /requires policy approval/);

    const approved = runCli(tempRoot, [
      "run",
      "demo.agent",
      "--config",
      configPath,
      "--input",
      "execute",
      "--approve-policy",
      "--json"
    ]);
    assert.equal(approved.status, 0);
    const result = JSON.parse(approved.stdout);
    assert.equal(result.approval.approved, true);
    assert.equal(result.approval.enforced, true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("run requires approval for user-approved outbound providers", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-outbound-approval-"));
  try {
    const configPath = path.join(tempRoot, "outbound.yaml");
    writeFileSync(configPath, [
      "version: 1",
      "providers:",
      "  external:",
      "    type: openai-compatible",
      "    baseUrl: https://api.example.com/v1",
      "    apiKey: test-key",
      "    model: example-model",
      "routes:",
      "  demo.research:",
      "    provider: external",
      "    policy: default",
      "policies:",
      "  default:",
      "    allowOutbound: user-approved",
      ""
    ].join("\n"), "utf8");

    const blocked = runCli(tempRoot, [
      "run",
      "demo.research",
      "--config",
      configPath,
      "--input",
      "execute"
    ]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /requires policy approval/);

    const dryRun = runCli(tempRoot, [
      "run",
      "demo.research",
      "--config",
      configPath,
      "--dry-run",
      "--input",
      "preview"
    ]);
    assert.equal(dryRun.status, 0);
    assert.match(dryRun.stdout, /Approval: live:dry-run/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("run blocks provider overrides that violate route policy provider types", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-provider-type-policy-"));
  try {
    const result = runCli(tempRoot, [
      "run",
      "auto_ops.agent_flow",
      "--provider",
      "grok",
      "--dry-run",
      "--input",
      "preview agent route"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /blocked by policy/);
    assert.match(result.stderr, /allowedProviderTypes/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("runs show refuses paths outside local run records", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-runs-guard-"));
  try {
    const result = runCli(tempRoot, ["runs", "show", "docs/result.json"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Run record not found/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("structured output refuses paths outside runtime tmp", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-run-output-guard-"));
  try {
    const result = runCli(tempRoot, [
      "run",
      "auto_ops.research",
      "--dry-run",
      "--input",
      "fresh output guard check",
      "--output",
      "docs/result.json"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside runtime\/tmp/);
    assert.equal(existsSync(path.join(tempRoot, "docs", "result.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function runCli(cwd: string, args: string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function runCliAsync(cwd: string, args: string[], env: Record<string, string> = {}): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
