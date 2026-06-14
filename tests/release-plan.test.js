import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const releasePlanScript = fileURLToPath(new URL("../tools/check-release-plan.js", import.meta.url));

async function runReleasePlan(cwd, args = ["--json"]) {
  const child = spawn(process.execPath, [releasePlanScript, ...args], {
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

describe("release plan report", () => {
  it("reports the v0.1 release plan as machine-readable JSON", async () => {
    const result = await runReleasePlan(process.cwd());
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.counts.fail, 0);
    assert.equal(report.release.tag, "v0.1.0");
    assert.equal(report.release.manualGates, "tools/show-release-manual-gates.js");
    assert.equal(report.release.githubHardening, "tools/new-github-hardening-worksheet.js");
    assert.equal(report.release.setupHandoff, "tools/show-setup-handoff.js");
    assert.equal(report.release.decisions, "tools/check-release-decisions.js");
    assert.equal(report.release.decisionsNext, "tools/show-release-decision-next.js");
    assert.equal(report.release.evidence, "tools/new-release-evidence.js");
    assert.equal(report.checks.some((check) => check.name === "CHANGELOG v0.1.0 entry" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "GitHub release draft" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release decision record" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "public quickstart release path" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release manual gates handoff" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "script setup:handoff" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release decision next commands" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "release evidence handoff" && check.status === "pass"), true);
    assert.equal(report.summary.manualOpen > 0, true);
  });

  it("fails when required release artifacts are missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-release-plan-"));
    try {
      await mkdir(path.join(dir, "docs", "00-governance"), { recursive: true });
      await writeFile(path.join(dir, "package.json"), JSON.stringify({
        name: "@xiaoqi-ai/ai-link",
        version: "0.1.0",
        license: "Apache-2.0",
        bin: { "ai-link": "dist/cli.js" },
        files: ["dist", "README.md", "LICENSE", "docs", "examples"],
        scripts: {}
      }), "utf8");
      await writeFile(path.join(dir, "docs", "00-governance", "open-questions.md"), "# Open\n", "utf8");

      const result = await runReleasePlan(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.checks.some((check) => check.name === "CHANGELOG.md" && check.status === "fail"), true);
      assert.equal(report.checks.some((check) => check.name === "release process gate" && check.status === "fail"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
