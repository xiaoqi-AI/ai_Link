import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const maintainerPackScript = fileURLToPath(new URL("../tools/show-maintainer-action-pack.js", import.meta.url));

async function runMaintainerPack(args = ["--json"], env = {}) {
  const child = spawn(process.execPath, [maintainerPackScript, ...args], {
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

describe("maintainer action pack", () => {
  it("prints a public-safe machine-readable maintainer handoff", async () => {
    const result = await runMaintainerPack();
    const report = JSON.parse(result.stdout);
    const ids = report.sections.map((section) => section.id).sort();

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.missingSourceCount, 0);
    assert.equal(report.summary.manualOpen > 0, true);
    assert.equal(report.repository.head.length > 0, true);
    assert.deepEqual(ids, [
      "auth-hub-remote-mock-dry-run",
      "baseline-before-external-work",
      "bitwarden-local-foundation",
      "github-ui-hardening",
      "provider-live-cost-gate",
      "provider-live-github-wiring",
      "release-channel-choice",
      "release-decision-closeout"
    ]);
    assert.equal(report.sources.githubHardeningNext.available, true);
    assert.equal(report.sources.releaseDecisionNext.available, true);
    assert.equal(report.sections.some((section) => section.id === "auth-hub-remote-mock-dry-run" && section.commands?.some((command) => command.includes("auth-hub:remote:smoke"))), true);
    assert.equal(report.sections.some((section) => section.links?.some((link) => link.includes("/settings/rules"))), true);
    assert.equal(report.sections.some((section) => section.commands?.some((command) => command.includes("bws:acceptance:json"))), true);
    assert.equal(report.sections.some((section) => section.afterReviewCommands?.some((command) => command.includes("release:decisions:update"))), true);
    assert.equal(report.safety.some((line) => line.includes("Does not read API keys")), true);
  });

  it("renders a public markdown action pack", async () => {
    const result = await runMaintainerPack([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI Link Maintainer Action Pack/);
    assert.match(result.stdout, /GitHub UI hardening/);
    assert.match(result.stdout, /Auth Hub remote mock dry-run/);
    assert.match(result.stdout, /Bitwarden local foundation/);
    assert.match(result.stdout, /auth-hub:remote:smoke/);
    assert.match(result.stdout, /bws:acceptance:json/);
    assert.match(result.stdout, /Missing source reports: 0/);
    assert.match(result.stdout, /Provider-live cost gate/);
    assert.match(result.stdout, /release:decisions:update/);
    assert.match(result.stdout, /does not read or print secret values/i);
  });

  it("does not print session token values", async () => {
    const result = await runMaintainerPack(["--json"], {
      GH_TOKEN: "test-maintainer-gh-token",
      GITHUB_TOKEN: "test-maintainer-github-token",
      BWS_ACCESS_TOKEN: "test-maintainer-bws-token"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("test-maintainer-gh-token"), false);
    assert.equal(result.stdout.includes("test-maintainer-github-token"), false);
    assert.equal(result.stdout.includes("test-maintainer-bws-token"), false);
  });
});
