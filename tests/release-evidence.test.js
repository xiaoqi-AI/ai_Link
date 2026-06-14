import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const evidenceScript = fileURLToPath(new URL("../tools/new-release-evidence.js", import.meta.url));

async function runEvidence(args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [evidenceScript, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
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

describe("release evidence report", () => {
  it("collects release evidence as machine-readable JSON", async () => {
    const result = await runEvidence(["--json"], { AI_LINK_RELEASE_EVIDENCE_SKIP_HEAVY: "1" });
    const report = JSON.parse(result.stdout);
    const stepIds = report.steps.map((step) => step.id);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen > 0, true);
    assert.equal(stepIds.includes("onboarding"), true);
    assert.equal(stepIds.includes("nextActions"), true);
    assert.equal(stepIds.includes("packageInstallSmoke"), true);
    assert.equal(stepIds.includes("githubHardening"), true);
    assert.equal(stepIds.includes("releaseDecisions"), true);
    assert.equal(stepIds.includes("releaseManualGates"), true);
    assert.equal(stepIds.includes("releaseReadiness"), true);
    assert.equal(report.steps.some((step) => step.id === "packageInstallSmoke" && step.status === "skipped"), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("renders a public markdown summary", async () => {
    const result = await runEvidence(["--skip-heavy"], { AI_LINK_RELEASE_EVIDENCE_SKIP_HEAVY: "1" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link Release Evidence/);
    assert.match(result.stdout, /Manual open:/);
    assert.match(result.stdout, /release-evidence\.json/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });
});
