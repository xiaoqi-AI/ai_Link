import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const setupHandoffScript = fileURLToPath(new URL("../tools/show-setup-handoff.js", import.meta.url));

async function runSetupHandoff(args = ["--json"]) {
  const child = spawn(process.execPath, [setupHandoffScript, ...args], {
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

describe("setup handoff report", () => {
  it("prints an ordered setup handoff as machine-readable JSON", async () => {
    const result = await runSetupHandoff();
    const report = JSON.parse(result.stdout);
    const ids = report.phases.map((phase) => phase.id);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen, 6);
    assert.deepEqual(ids, [
      "local-baseline",
      "bitwarden-foundation",
      "github-provider-live-wiring",
      "github-hardening",
      "release-decision-record",
      "provider-live-cost-and-verification",
      "release-channel"
    ]);
    assert.equal(report.decisionSnapshot.available, true);
    assert.equal(report.decisionSnapshot.decisions.length > 0, true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.phases.every((phase) => phase.commands.length > 0 && phase.evidence.length > 0), true);
    assert.equal(report.phases.every((phase) => phase.secretBoundary.length > 0), true);
  });

  it("renders a public markdown setup handoff", async () => {
    const result = await runSetupHandoff([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link Setup Handoff/);
    assert.match(result.stdout, /Create Bitwarden Secrets Manager foundation/);
    assert.match(result.stdout, /Wire GitHub provider-live through Bitwarden/);
    assert.match(result.stdout, /npm run bws:acceptance:strict/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });
});
