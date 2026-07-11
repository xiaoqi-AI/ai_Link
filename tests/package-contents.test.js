import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageCheckScript = fileURLToPath(new URL("../tools/check-package-contents.js", import.meta.url));

async function runPackageCheck(cwd, args = ["--json"]) {
  const child = spawn(process.execPath, [packageCheckScript, ...args], {
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

describe("package contents report", () => {
  it("reports the repository package baseline as machine-readable JSON", async () => {
    const result = await runPackageCheck(process.cwd());
    const report = JSON.parse(result.stdout);
    const fileChecks = report.checks.filter((check) => check.category === "files");

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.counts.fail, 0);
    assert.equal(report.package.name, "@xiaoqi-ai/ai-link");
    assert.equal(fileChecks.some((check) => check.name === "required file dist/cli.js" && check.status === "pass"), true);
    assert.equal(fileChecks.some((check) => check.name === "required file dist/connectors/gscCheck.js" && check.status === "pass"), true);
    assert.equal(fileChecks.some((check) => check.name === "required file examples/codex-skills/bws-secret-mode/SKILL.md" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.name === "compiled tests excluded" && check.status === "pass"), true);
  });

  it("fails when package contents expose source files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-link-package-"));
    try {
      await mkdir(path.join(dir, "dist"), { recursive: true });
      await mkdir(path.join(dir, "src"), { recursive: true });
      await writeFile(path.join(dir, "README.md"), "# Test package\n", "utf8");
      await writeFile(path.join(dir, "CHANGELOG.md"), "# Changelog\n", "utf8");
      await writeFile(path.join(dir, "LICENSE"), "Apache License\nVersion 2.0\n", "utf8");
      await writeFile(path.join(dir, "dist", "cli.js"), "console.log('cli');\n", "utf8");
      await writeFile(path.join(dir, "dist", "index.js"), "export {};\n", "utf8");
      await writeFile(path.join(dir, "dist", "types.d.ts"), "export {};\n", "utf8");
      await writeFile(path.join(dir, "src", "private.ts"), "export const value = 1;\n", "utf8");
      await writeFile(path.join(dir, "package.json"), JSON.stringify({
        name: "@xiaoqi-ai/ai-link",
        version: "0.1.0",
        license: "Apache-2.0",
        bin: { "ai-link": "dist/cli.js" },
        files: ["dist", "src", "README.md", "LICENSE"]
      }), "utf8");

      const result = await runPackageCheck(dir);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.equal(report.checks.some((check) => check.name === "source tree excluded" && check.status === "fail"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
