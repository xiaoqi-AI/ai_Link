import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const decisionsScript = fileURLToPath(new URL("../tools/check-release-decisions.js", import.meta.url));

async function runDecisions(cwd, args = ["--json"]) {
  const child = spawn(process.execPath, [decisionsScript, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const status = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

describe("release decisions report", () => {
  it("reports the public v0.1 decision record as machine-readable JSON", async () => {
    const result = await runDecisions(process.cwd());
    const report = JSON.parse(result.stdout);
    const ids = report.decisions.map((decision) => decision.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.strictOk, false);
    assert.equal(report.summary.manualOpen, 4);
    assert.deepEqual(ids, [
      "github-branch-protection",
      "github-secret-scanning",
      "npm-publish-decision",
      "provider-live-credentials"
    ]);
    assert.equal(report.outcomes.some((outcome) => outcome.id === "npm-publish" && outcome.status === "blocked"), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("fails strict mode while decisions are still pending", async () => {
    const result = await runDecisions(process.cwd(), ["--json", "--strict"]);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 2);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.strictOk, false);
  });

  it("renders a public markdown decision handoff", async () => {
    const result = await runDecisions(process.cwd(), []);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link v0\.1 Release Decisions/);
    assert.match(result.stdout, /Manual open:/);
    assert.match(result.stdout, /release:decisions:strict/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("fails when required decisions are missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-release-decisions-"));
    try {
      await mkdir(path.join(dir, "docs", "releases"), { recursive: true });
      await writeFile(path.join(dir, "docs", "releases", "v0.1.0-decisions.json"), JSON.stringify({
        schemaVersion: 1,
        release: "v0.1.0",
        safety: ["Do not add API keys."],
        decisions: []
      }), "utf8");

      const result = await runDecisions(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.checks.some((check) => check.name === "decision github-branch-protection" && check.status === "fail"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
