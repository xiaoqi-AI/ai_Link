import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const readinessScript = fileURLToPath(new URL("../tools/check-release-readiness.js", import.meta.url));

async function runReadiness(cwd, args = []) {
  const child = spawn(process.execPath, [readinessScript, ...args], {
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

describe("release readiness report", () => {
  it("reports the repository release baseline as machine-readable JSON", async () => {
    const result = await runReadiness(process.cwd(), ["--json"]);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.counts.fail, 0);
    assert.equal(report.summary.manualOpen > 0, true);
    assert.equal(report.checks.some((check) => check.name === "script release:readiness" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script next:actions" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script setup:handoff" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "next actions report" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "setup handoff report" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script release:manual-gates" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script release:decisions" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script release:decisions:next" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script release:decisions:update" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release decisions report" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release decision next commands" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release decision update helper" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release manual gates report" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script release:evidence" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release evidence report" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "provider live safe workflow" && check.status === "pass"), true);
  });

  it("fails when required public release files are missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-readiness-"));
    try {
      await mkdir(path.join(dir, ".github", "workflows"), { recursive: true });
      await writeFile(path.join(dir, "package.json"), JSON.stringify({
        name: "@xiaoqi-ai/ai-link",
        version: "0.1.0",
        license: "Apache-2.0",
        scripts: {}
      }), "utf8");

      const result = await runReadiness(dir, ["--json"]);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.summary.counts.fail > 0, true);
      assert.equal(report.checks.some((check) => check.name === "README.md" && check.status === "fail"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
