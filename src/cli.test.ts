import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cliPath = path.resolve("dist", "cli.js");

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
  } finally {
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

function runCli(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
