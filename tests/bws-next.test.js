import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const bwsNextScript = fileURLToPath(new URL("../tools/show-bws-next.js", import.meta.url));

async function runBwsNext(cwd, args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [bwsNextScript, ...args], {
    cwd,
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

describe("BWS next steps report", () => {
  it("prints a public-safe machine-readable setup state", async () => {
    const result = await runBwsNext(process.cwd());
    const report = JSON.parse(result.stdout);
    const phaseIds = report.phases.map((phase) => phase.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen > 0, true);
    assert.equal(report.snapshot.organization, "ai-link-lab");
    assert.deepEqual(phaseIds, [
      "approve-live-provider-cost",
      "create-bitwarden-resources",
      "load-local-session",
      "review-target-structure",
      "verify-local-bws",
      "wire-github-provider-live"
    ]);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.equal(report.phases.every((phase) => phase.commands.length > 0 && phase.evidence.length > 0), true);
  });

  it("does not print session token values", async () => {
    const result = await runBwsNext(process.cwd(), ["--json"], {
      AI_LINK_BWS_PROJECT_ID: "test-local-project-id",
      AI_LINK_BWS_CI_PROJECT_ID: "test-ci-project-id",
      BWS_ACCESS_TOKEN: "test-bws-secret-token",
      GH_TOKEN: "test-gh-secret-token"
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("test-bws-secret-token"), false);
    assert.equal(result.stdout.includes("test-gh-secret-token"), false);
    assert.equal(result.stdout.includes("test-local-project-id"), false);
    assert.equal(result.stdout.includes("test-ci-project-id"), false);
    assert.equal(report.checks.some((check) => check.name === "BWS_ACCESS_TOKEN" && check.detail === "present; value not printed"), true);
    assert.equal(report.checks.some((check) => check.name === "GH_TOKEN or GITHUB_TOKEN" && check.detail === "present; value not printed"), true);
  });

  it("renders a public markdown handoff", async () => {
    const result = await runBwsNext(process.cwd(), []);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link BWS Next Steps/);
    assert.match(result.stdout, /Create Bitwarden resources/);
    assert.match(result.stdout, /provider-live Environment/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("fails when the BWS manifest is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-bws-next-"));
    try {
      await mkdir(path.join(dir, ".ai-link"), { recursive: true });

      const result = await runBwsNext(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.checks.some((check) => check.name === "BWS manifest" && check.status === "fail"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
