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
      "accept-platform-readonly-p0-2",
      "approve-provider-live-cost",
      "configure-auth-hub-remote-mock-dry-run",
      "configure-bitwarden-secrets-manager",
      "configure-github-hardening",
      "configure-provider-live-environment",
      "decide-v0-1-release-channel",
      "keep-local-baseline-green",
      "merge-auth-hub-program-stack",
      "record-v0-1-release-decisions"
    ]);
    const mergeAction = report.actions.find((action) => action.id === "merge-auth-hub-program-stack");
    assert.match(mergeAction.background, /PR #21 is merged/);
    assert.match(mergeAction.recommendation, /#22 -> #23 -> #26 -> #24 -> #25 -> #27 -> #28/);
    assert.equal(Boolean(mergeAction.value && mergeAction.risk), true);
    const remoteAction = report.actions.find((action) => action.id === "configure-auth-hub-remote-mock-dry-run");
    assert.equal(remoteAction.status, "gated");
    assert.equal(remoteAction.commands.some((command) => command.includes("<confirmed-auth-hub-url>")), true);
    assert.equal(remoteAction.commands.some((command) => command.includes("https://auth.xiao-qi-ai.com")), false);
    const platformAction = report.actions.find((action) => action.id === "accept-platform-readonly-p0-2");
    assert.match(platformAction.recommendation, /GitHub read-only first/);
    assert.equal(report.actions.find((action) => action.id === "configure-github-hardening").status, "ready");
    assert.equal(report.actions.find((action) => action.id === "record-v0-1-release-decisions").status, "ready");
    assert.equal(report.actions.find((action) => action.id === "decide-v0-1-release-channel").status, "ready");
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.actions.every((action) => action.commands.length > 0 && action.evidence.length > 0), true);
  });

  it("prints a public Markdown next-action map", async () => {
    const result = await runNextActions([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link Next Actions/);
    assert.match(result.stdout, /Merge Auth Hub program stack in dependency order/);
    assert.match(result.stdout, /Approve platform read-only P0.2 acceptance/);
    assert.match(result.stdout, /#22 -> #23 -> #26 -> #24 -> #25 -> #27 -> #28/);
    assert.match(result.stdout, /Configure Bitwarden Secrets Manager/);
    assert.match(result.stdout, /Configure Auth Hub remote mock dry-run/);
    assert.match(result.stdout, /auth-hub:remote:smoke/);
    assert.match(result.stdout, /Keep recorded v0\.1 release decisions current/);
    assert.match(result.stdout, /release:decisions:next/);
    assert.match(result.stdout, /npm run bws:acceptance:strict/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });
});
