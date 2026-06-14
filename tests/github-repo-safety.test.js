import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const safetyScript = fileURLToPath(new URL("../tools/check-github-repo-safety.js", import.meta.url));

async function runSafety(cwd, args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [safetyScript, ...args], {
    cwd,
    env: {
      ...process.env,
      AI_LINK_GITHUB_SAFETY_DISABLE_REMOTE: "1",
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

describe("GitHub repository safety report", () => {
  it("reports the repository local safety baseline as machine-readable JSON", async () => {
    const result = await runSafety(process.cwd());
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.counts.fail, 0);
    assert.equal(report.summary.manualOpen > 0, true);
    assert.equal(report.checks.some((check) => check.name === "branch protection guide" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "GitHub remote checks" && check.status === "manual"), true);
  });

  it("fails when the branch protection guide is missing required policy text", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-github-safety-"));
    try {
      await mkdir(path.join(dir, ".github", "workflows"), { recursive: true });
      await mkdir(path.join(dir, "docs", "00-governance"), { recursive: true });
      await writeFile(path.join(dir, "SECURITY.md"), "# Security\n", "utf8");
      await writeFile(path.join(dir, ".github", "workflows", "ci.yml"), [
        "name: CI",
        "jobs:",
        "  verify:",
        "    name: Verify",
        "    steps:",
        "      - run: npm run check",
        "      - run: npm test",
        "      - run: npm run security:scan",
        "      - run: npm run package:check",
        "      - run: npm run release:readiness"
      ].join("\n"), "utf8");
      await writeFile(path.join(dir, "docs", "00-governance", "github-branch-protection.md"), "# Incomplete\n", "utf8");
      await writeFile(path.join(dir, "package.json"), JSON.stringify({
        name: "@xiaoqi-ai/ai-link",
        scripts: {
          "github:safety": "node tools/check-github-repo-safety.js",
          "github:safety:json": "node tools/check-github-repo-safety.js --json",
          "release:readiness": "node tools/check-release-readiness.js",
          "security:scan": "node tools/security-scan.js"
        }
      }), "utf8");

      const result = await runSafety(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.checks.some((check) => check.name === "branch protection guide contents" && check.status === "fail"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
