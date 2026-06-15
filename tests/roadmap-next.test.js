import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const roadmapScript = fileURLToPath(new URL("../tools/show-roadmap-next.js", import.meta.url));

async function runRoadmap(args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [roadmapScript, ...args], {
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

describe("roadmap next report", () => {
  it("prints a public-safe machine-readable roadmap", async () => {
    const result = await runRoadmap();
    const report = JSON.parse(result.stdout);
    const ids = report.phases.map((phase) => phase.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.phases, 6);
    assert.equal(report.summary.openDecisions > 0, true);
    assert.equal(report.repository.head.length > 0, true);
    assert.deepEqual(ids, [
      "later-sdk-and-ecosystem",
      "v0-1-local-public-baseline",
      "v0-1-maintainer-external-gates",
      "v0-2-real-provider-acceptance",
      "v0-2-skill-authoring",
      "v0-3-agent-connectors"
    ]);
    assert.equal(report.phases.some((phase) => phase.nextCommands.some((command) => command.includes("roadmap:next:json"))), true);
    assert.equal(report.phases.some((phase) => phase.openQuestions.some((question) => question.includes("Coze real integration"))), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("renders a public markdown roadmap", async () => {
    const result = await runRoadmap([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link Roadmap Next/);
    assert.match(result.stdout, /v0\.1 local public baseline/);
    assert.match(result.stdout, /v0\.2 real provider acceptance/);
    assert.match(result.stdout, /Later SDK and ecosystem/);
    assert.match(result.stdout, /roadmap:next:json/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("does not print session token values", async () => {
    const result = await runRoadmap(["--json"], {
      GH_TOKEN: "test-roadmap-gh-token",
      GITHUB_TOKEN: "test-roadmap-github-token",
      BWS_ACCESS_TOKEN: "test-roadmap-bws-token"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("test-roadmap-gh-token"), false);
    assert.equal(result.stdout.includes("test-roadmap-github-token"), false);
    assert.equal(result.stdout.includes("test-roadmap-bws-token"), false);
  });
});
