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
    assert.equal(report.summary.programModules, 3);
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
    assert.deepEqual(report.program.modules.map((module) => module.id), [
      "auth-hub-status-center",
      "platform-auth-connectors-p0-2",
      "auth-hub-remote"
    ]);
    assert.equal(report.program.mergeStatus, "complete");
    assert.deepEqual(report.program.mergeOrder, ["#22", "#23", "#26", "#24", "#25", "#27", "#28", "#29", "#30"]);
    assert.match(report.program.recommendedNext, /GitHub read-only acceptance/);
    assert.equal(report.program.modules.some((module) => module.pending.some((item) => /Merge PR|rebase|retarget/i.test(item))), false);
    assert.equal(report.program.modules.every((module) => (
      module.completed.length > 0
      && module.pending.length > 0
      && module.decision.background
      && module.decision.content
      && module.decision.recommendation
      && module.decision.value
      && module.decision.risk
    )), true);
    const authHubPhase = report.phases.find((phase) => phase.id === "v0-3-agent-connectors");
    assert.equal(authHubPhase.nextCommands.includes("npm run auth-hub:status:json"), true);
    assert.equal(authHubPhase.nextCommands.some((command) => command.includes("auth-status:next")), false);
    assert.equal(report.phases.some((phase) => phase.nextCommands.some((command) => command.includes("roadmap:next:json"))), true);
    assert.equal(report.phases.some((phase) => phase.openQuestions.some((question) => question.includes("PR #22"))), false);
    assert.equal(result.stdout.includes("Which real connector comes first"), false);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("renders a public markdown roadmap", async () => {
    const result = await runRoadmap([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# AI Link Roadmap Next/);
    assert.match(result.stdout, /Program Control/);
    assert.match(result.stdout, /Auth Hub 状态中枢/);
    assert.match(result.stdout, /平台授权连接器 P0.2/);
    assert.match(result.stdout, /Merge chain status: complete/);
    assert.match(result.stdout, /#22 -> #23 -> #26 -> #24 -> #25 -> #27 -> #28 -> #29 -> #30/);
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
