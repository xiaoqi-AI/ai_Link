import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const boundaryScript = fileURLToPath(new URL("../tools/show-iteration-boundary.js", import.meta.url));

async function runBoundary(cwd, args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [boundaryScript, ...args], {
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

describe("iteration boundary report", () => {
  it("prints a public-safe machine-readable boundary card contract", async () => {
    const result = await runBoundary(process.cwd());
    const report = JSON.parse(result.stdout);
    const sectionIds = report.template.sections.map((section) => section.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.sections, 4);
    assert.equal(report.summary.verificationProfiles, 3);
    assert.deepEqual(sectionIds, [
      "boundary-control",
      "expected-work",
      "requirement",
      "verification"
    ]);
    assert.equal(report.checks.every((check) => check.status === "pass"), true);
    assert.equal(report.template.markdown.includes("## 需求"), true);
    assert.equal(report.controls.stopConditions.some((condition) => condition.includes("user goal")), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("renders a public Markdown boundary handoff", async () => {
    const result = await runBoundary(process.cwd(), []);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link Iteration Boundary/);
    assert.match(result.stdout, /Boundary Card Template/);
    assert.match(result.stdout, /## 需求/);
    assert.match(result.stdout, /Verification Profiles/);
    assert.match(result.stdout, /Stop Conditions/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("does not print session token values", async () => {
    const result = await runBoundary(process.cwd(), ["--json"], {
      GH_TOKEN: "test-iteration-gh-token",
      GITHUB_TOKEN: "test-iteration-github-token",
      BWS_ACCESS_TOKEN: "test-iteration-bws-token"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("test-iteration-gh-token"), false);
    assert.equal(result.stdout.includes("test-iteration-github-token"), false);
    assert.equal(result.stdout.includes("test-iteration-bws-token"), false);
  });

  it("fails when governance files are missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-iteration-boundary-"));
    try {
      await mkdir(path.join(dir, "docs", "00-governance"), { recursive: true });

      const result = await runBoundary(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.checks.some((check) => check.name === "iteration boundary governance doc" && check.status === "fail"), true);
      assert.equal(report.recommendedNext.id, "restore-iteration-boundary-governance");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
