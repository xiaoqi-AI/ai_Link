import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const nextActionsScript = fileURLToPath(new URL("../tools/show-next-actions.js", import.meta.url));

async function runNextActions(args = ["--json"]) {
  const child = spawn(process.execPath, [nextActionsScript, ...args], {
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

describe("next actions report", () => {
  it("prints the current handoff map as machine-readable JSON", async () => {
    const result = await runNextActions();
    const report = JSON.parse(result.stdout);
    const ids = report.actions.map((action) => action.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.nextOpen, 6);
    assert.equal(report.repository.branch.length > 0, true);
    assert.equal(report.repository.head.length > 0, true);
    assert.deepEqual(ids, [
      "approve-provider-live-cost",
      "configure-bitwarden-secrets-manager",
      "configure-github-hardening",
      "configure-provider-live-environment",
      "decide-v0-1-release-channel",
      "keep-local-baseline-green",
      "record-v0-1-release-decisions"
    ]);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.actions.every((action) => action.commands.length > 0 && action.evidence.length > 0), true);
  });

  it("prints a public Markdown next-action map", async () => {
    const result = await runNextActions([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link Next Actions/);
    assert.match(result.stdout, /Configure Bitwarden Secrets Manager/);
    assert.match(result.stdout, /Record v0\.1 release decisions/);
    assert.match(result.stdout, /npm run bws:acceptance:strict/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });
});
