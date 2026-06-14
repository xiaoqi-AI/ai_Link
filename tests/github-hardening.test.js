import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const hardeningScript = fileURLToPath(new URL("../tools/new-github-hardening-worksheet.js", import.meta.url));

async function runHardening(args = ["--json"]) {
  const child = spawn(process.execPath, [hardeningScript, ...args], {
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

describe("github hardening worksheet", () => {
  it("prints the manual GitHub hardening worksheet as JSON", async () => {
    const result = await runHardening();
    const report = JSON.parse(result.stdout);
    const stepIds = report.steps.map((step) => step.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.manualOpen, 4);
    assert.equal(report.repository.fullName, "xiaoqi-AI/ai_Link");
    assert.equal(report.repository.requiredStatusCheck, "Verify");
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
    assert.deepEqual(stepIds, [
      "internal-secret-scanning",
      "post-configuration-verification",
      "public-main-ruleset",
      "public-secret-scanning"
    ]);
    assert.equal(report.verificationCommands.includes("npm run github:safety:json"), true);
  });

  it("renders a public Markdown worksheet", async () => {
    const result = await runHardening(["--output", "runtime/tmp/github-hardening-test.md"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link GitHub Hardening Worksheet/);
    assert.match(result.stdout, /Protect public main branch/);
    assert.match(result.stdout, /secret scanning/i);
    assert.match(result.stdout, /npm run github:safety:json/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("refuses to write outside runtime tmp", async () => {
    const result = await runHardening(["--json", "--output", "docs/github-hardening.json"]);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 2);
    assert.equal(report.summary.ok, false);
    assert.match(report.output.error, /outside runtime\/tmp/);
  });
});
