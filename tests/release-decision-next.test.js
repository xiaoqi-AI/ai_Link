import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const nextScript = fileURLToPath(new URL("../tools/show-release-decision-next.js", import.meta.url));

async function runDecisionNext(cwd, args = ["--json"]) {
  const child = spawn(process.execPath, [nextScript, ...args], {
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

describe("release decision next commands", () => {
  it("prints public-safe next commands for all v0.1 decisions", async () => {
    const result = await runDecisionNext(process.cwd());
    const report = JSON.parse(result.stdout);
    const ids = report.decisions.map((decision) => decision.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen, 2);
    assert.deepEqual(ids, [
      "github-branch-protection",
      "github-secret-scanning",
      "npm-publish-decision",
      "provider-live-credentials"
    ]);
    assert.equal(report.recommendation.includes("repository-local"), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.decisions.every((decision) => decision.suggestions.length > 0), true);
    assert.equal(report.decisions.some((decision) => decision.suggestions.some((suggestion) => suggestion.previewCommand.includes("release:decisions:update"))), true);
    assert.equal(report.decisions.some((decision) => decision.suggestions.some((suggestion) => suggestion.writeCommand.endsWith("--yes"))), true);
  });

  it("renders a public markdown command handoff", async () => {
    const result = await runDecisionNext(process.cwd(), []);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link Release Decision Next Commands/);
    assert.match(result.stdout, /repository-local/);
    assert.match(result.stdout, /release:decisions:update/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("fails when the public decision record is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-release-decision-next-"));
    try {
      await mkdir(path.join(dir, "docs", "releases"), { recursive: true });
      await writeFile(path.join(dir, "docs", "releases", "placeholder.md"), "# empty\n", "utf8");

      const result = await runDecisionNext(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.summary.counts.decisions, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
