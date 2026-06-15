import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../tools/new-bws-acceptance-report.ps1", import.meta.url));
const powershell = resolvePowerShell();

function resolvePowerShell() {
  if (process.platform !== "win32") {
    return undefined;
  }

  const result = spawnSync("powershell", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (!result.error && result.status === 0) {
    return "powershell";
  }
  return undefined;
}

async function runAcceptanceJson(env = {}) {
  const child = spawn(
    powershell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Json"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

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

describe("BWS acceptance report", () => {
  it("prints a public-safe machine-readable acceptance state without leaking session tokens", { skip: !powershell }, async () => {
    const result = await runAcceptanceJson({
      BWS_ACCESS_TOKEN: "test-bws-acceptance-token"
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, true);
    assert.equal(report.summary.strictOk, false);
    assert.equal(report.summary.counts.pending > 0, true);
    assert.equal(report.repository, "xiaoqi-AI/ai_Link");
    assert.equal(report.safety.some((line) => line.includes("Secret values are never printed")), true);
    assert.equal(report.checks.some((check) => check.name === "BWS manifest consistency" && check.status === "pass"), true);
    assert.equal(result.stdout.includes("test-bws-acceptance-token"), false);
    assert.equal(report.checks.some((check) => check.name === "BWS_ACCESS_TOKEN" && check.detail === "present in current session; value not printed"), true);
  });
});
