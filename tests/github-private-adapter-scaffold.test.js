import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPrivateConnectorRegistry } from "../src/connectors/privateLoader.js";
import { describeConnectorRegistry } from "../src/connectors/contracts.js";

const scaffoldScript = fileURLToPath(new URL("../tools/new-github-auth-private-adapter.js", import.meta.url));

async function runScaffold({ cwd = process.cwd(), args = [], env = {} } = {}) {
  const child = spawn(process.execPath, [scaffoldScript, ...args], {
    cwd,
    env: {
      ...process.env,
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const status = await new Promise((resolve) => child.on("close", resolve));
  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

describe("GitHub private auth adapter scaffold", () => {
  it("writes a private adapter under runtime/private and keeps secrets out of output", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--json"],
        env: { GH_TOKEN: "secret-value-that-must-not-print" }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);
      assert.equal(report.summary.output, "runtime/private/github-auth-adapter.mjs");
      assert.equal(result.stdout.includes("secret-value-that-must-not-print"), false);

      const adapterPath = path.join(workspace, "runtime", "private", "github-auth-adapter.mjs");
      const adapterText = await readFile(adapterPath, "utf8");
      assert.match(adapterText, /createPrivateConnectors/);
      assert.match(adapterText, /checkAuth/);

      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      const summary = describeConnectorRegistry(registry);
      const github = summary.connectors.find((connector) => connector.platform === "github");
      assert.equal(github.status, "available");
      assert.equal(github.mode, "private");
      assert.ok(github.capabilities.some((capability) => capability.name === "check_auth" && capability.available));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refuses to write outside runtime/private", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--json", "--output", "../github-auth-adapter.mjs"]
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, false);
      assert.ok(report.blockers.some((blocker) => blocker.includes("runtime/private")));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("renders a public handoff without writing when --print is used", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--print"],
        env: { GITHUB_TOKEN: "secret-value-that-must-not-print" }
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /GitHub Private Auth Adapter Scaffold/);
      assert.match(result.stdout, /runtime\/private\/github-auth-adapter\.mjs/);
      assert.equal(result.stdout.includes("secret-value-that-must-not-print"), false);
      await assert.rejects(readFile(path.join(workspace, "runtime", "private", "github-auth-adapter.mjs"), "utf8"));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
