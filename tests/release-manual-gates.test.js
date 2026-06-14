import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const manualGatesScript = fileURLToPath(new URL("../tools/show-release-manual-gates.js", import.meta.url));

async function runManualGates(args = ["--json"]) {
  const child = spawn(process.execPath, [manualGatesScript, ...args], {
    cwd: process.cwd(),
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

describe("release manual gates report", () => {
  it("reports manual release gates as machine-readable JSON", async () => {
    const result = await runManualGates();
    const report = JSON.parse(result.stdout);
    const ids = report.gates.map((gate) => gate.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen, 4);
    assert.deepEqual(ids, [
      "github-branch-protection",
      "github-secret-scanning",
      "npm-publish-decision",
      "provider-live-credentials"
    ]);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.gates.every((gate) => gate.status === "manual"), true);
    assert.equal(report.gates.every((gate) => gate.actions.length > 0 && gate.evidence.length > 0), true);
  });

  it("renders a public markdown handoff", async () => {
    const result = await runManualGates([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link Release Manual Gates/);
    assert.match(result.stdout, /GitHub branch protection/);
    assert.match(result.stdout, /npm run release:readiness:json/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });
});
