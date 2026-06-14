import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const hardeningNextScript = fileURLToPath(new URL("../tools/show-github-hardening-next.js", import.meta.url));

async function runHardeningNext(args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [hardeningNextScript, ...args], {
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

describe("GitHub hardening next steps report", () => {
  it("prints a public-safe machine-readable handoff", async () => {
    const result = await runHardeningNext();
    const report = JSON.parse(result.stdout);
    const phaseIds = report.phases.map((phase) => phase.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen > 0, true);
    assert.equal(report.repository.fullName, "xiaoqi-AI/ai_Link");
    assert.equal(report.repository.requiredStatusCheck, "Verify");
    assert.deepEqual(phaseIds, [
      "configure-main-protection",
      "configure-secret-scanning",
      "record-public-safe-decisions",
      "review-local-github-baseline"
    ]);
    assert.equal(report.snapshot.localSafety.ok, true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.safety.some((line) => line.includes("Does not call GitHub APIs by default")), true);
  });

  it("renders public markdown with decision commands", async () => {
    const result = await runHardeningNext([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link GitHub Hardening Next Steps/);
    assert.match(result.stdout, /Configure main branch protection/);
    assert.match(result.stdout, /Configure secret scanning and push protection/);
    assert.match(result.stdout, /release:decisions:update -- --id github-branch-protection/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("does not print session token values", async () => {
    const result = await runHardeningNext(["--json"], {
      GH_TOKEN: "test-gh-hardening-token",
      GITHUB_TOKEN: "test-github-hardening-token"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("test-gh-hardening-token"), false);
    assert.equal(result.stdout.includes("test-github-hardening-token"), false);
  });
});
