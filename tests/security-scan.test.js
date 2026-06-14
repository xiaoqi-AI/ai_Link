import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scanScript = fileURLToPath(new URL("../tools/security-scan.js", import.meta.url));

async function withTempProject(callback) {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-link-security-scan-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runScan(cwd) {
  const child = spawn(process.execPath, [scanScript], {
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

describe("security scan public config gate", () => {
  it("allows public config that references env var names only", async () => {
    await withTempProject(async (dir) => {
      await mkdir(path.join(dir, ".ai-link"), { recursive: true });
      await writeFile(
        path.join(dir, ".ai-link", "project.yaml"),
        `version: 1
providers:
  grok:
    type: grok
    baseUrl: https://api.x.ai/v1
    apiKeyEnv: XAI_API_KEY
    model: grok-4.3
`,
        "utf8"
      );

      const result = await runScan(dir);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Security scan passed/);
    });
  });

  it("rejects private execution fields in public AI Link configs", async () => {
    await withTempProject(async (dir) => {
      const configDir = path.join(dir, "examples", "auto-ops");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, "project.yaml"),
        `version: 1
providers:
  coze:
    type: coze
    model: coze-agent-workflow
    command: coze
    args:
      - session
`,
        "utf8"
      );

      const result = await runScan(dir);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /providers\.coze\.command/);
      assert.match(result.stderr, /providers\.coze\.args/);
    });
  });
});
