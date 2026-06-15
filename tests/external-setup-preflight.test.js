import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const preflightScript = fileURLToPath(new URL("../tools/show-external-setup-preflight.js", import.meta.url));

async function runPreflight(args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [preflightScript, ...args], {
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

describe("external setup preflight", () => {
  it("prints a public-safe machine-readable go/no-go report", async () => {
    const result = await runPreflight();
    const report = JSON.parse(result.stdout);
    const ids = report.gates.map((gate) => gate.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(typeof report.summary.canStartExternalSetup, "boolean");
    assert.equal(report.summary.blockingCount >= 0, true);
    assert.equal(report.repository.branch.length > 0, true);
    assert.deepEqual(ids, [
      "bitwarden-foundation",
      "github-ui-hardening",
      "provider-live-cost",
      "provider-live-wiring",
      "release-channel",
      "release-decision-record",
      "repository-baseline"
    ]);
    assert.equal(report.sources.maintainerPack.available, true);
    assert.equal(report.sources.roadmapNext.available, true);
    assert.equal(report.firstSafeSequence.some((command) => command.includes("external:preflight")), true);
    assert.equal(report.gates.some((gate) => gate.links?.some((link) => link.includes("/settings/rules"))), true);
    assert.equal(report.gates.some((gate) => gate.commands?.some((command) => command.includes("bws:acceptance:json"))), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("renders a public markdown preflight", async () => {
    const result = await runPreflight([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link External Setup Preflight/);
    assert.match(result.stdout, /Ready for external manual setup:/);
    assert.match(result.stdout, /GitHub UI hardening/);
    assert.match(result.stdout, /Bitwarden foundation/);
    assert.match(result.stdout, /external:preflight/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("does not print session token values", async () => {
    const result = await runPreflight(["--json"], {
      GH_TOKEN: "test-preflight-gh-token",
      GITHUB_TOKEN: "test-preflight-github-token",
      BWS_ACCESS_TOKEN: "test-preflight-bws-token"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("test-preflight-gh-token"), false);
    assert.equal(result.stdout.includes("test-preflight-github-token"), false);
    assert.equal(result.stdout.includes("test-preflight-bws-token"), false);
  });
});
