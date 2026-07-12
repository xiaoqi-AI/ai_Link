import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const statusScript = fileURLToPath(new URL("../tools/show-auth-status-next-actions.js", import.meta.url));

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runStatus({ baseUrl = "http://127.0.0.1:1", env = {}, args = ["--json"] } = {}) {
  const child = spawn(process.execPath, [statusScript, "--base-url", baseUrl, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_LINK_CODEX_TOKEN: "",
      AI_LINK_ADMIN_TOKEN: "",
      CF_ACCESS_CLIENT_ID: "",
      CF_ACCESS_CLIENT_SECRET: "",
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

describe("Auth status next action client", () => {
  it("renders public-safe next actions from Auth Hub", async () => {
    await withServer((req, res) => {
      assert.equal(req.headers.authorization, "Bearer secret-codex-token");
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: {
            summary: {
              total: 2,
              ready: 1,
              needs_action: 1,
              reserved: 0,
              blocked: 0,
              next_actions: 1
            },
            items: [
              {
                platform: "xiaohongshu",
                status: "needs_action",
                connectorStatus: "available",
                mode: "private",
                reason: "login_expired",
                action: "需要续登",
                relatedTaskIds: ["task_123"],
                token: "private-token"
              }
            ],
            nextActions: [
              {
                platform: "xiaohongshu",
                status: "needs_action",
                reason: "login_expired",
                title: "需要续登",
                owner: "account_owner",
                severity: "manual",
                runbook: "在受信任本机完成平台续登后重试关联任务。",
                relatedTaskIds: ["task_123"],
                retryAfterAction: true,
                cookie: "private-cookie"
              }
            ]
          }
        }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.reachable, true);
      assert.equal(report.summary.nextActions, 1);
      assert.equal(report.nextActions[0].platform, "xiaohongshu");
      assert.equal(report.nextActions[0].owner, "account_owner");
      assert.equal(report.nextActions[0].retryAfterAction, true);
      assert.equal(result.stdout.includes("secret-codex-token"), false);
      assert.equal(result.stdout.includes("private-token"), false);
      assert.equal(result.stdout.includes("private-cookie"), false);
    });
  });

  it("reports a missing token without contacting Auth Hub", async () => {
    const result = await runStatus();
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.summary.ok, false);
    assert.equal(report.summary.reachable, false);
    assert.ok(report.blockers.some((blocker) => blocker.includes("Missing read-only Auth Hub API token")));
    assert.match(report.summary.recommendedNext, /AI_LINK_CODEX_TOKEN/);
  });

  it("fails closed in strict mode when executor or probe evidence is unverified", async () => {
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: {
            summary: { total: 1, ready: 0, unverified: 1, needs_action: 0, reserved: 0, blocked: 0, next_actions: 0 },
            items: [{
              platform: "xiaohongshu",
              status: "unverified",
              connectorStatus: "available",
              mode: "private",
              source: "executor",
              runtimeStatus: "online",
              operationalStatus: "unverified",
              canRunReal: false,
              reason: "probe_not_run",
              action: "能力已加载，尚未完成只读健康检查",
              relatedTaskIds: []
            }],
            nextActions: []
          }
        }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: ["--json", "--strict"]
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 1, result.stderr);
      assert.equal(report.summary.ok, false);
      assert.equal(report.summary.blockingCount, 1);
      assert.deepEqual(report.blockers, ["xiaohongshu: probe_not_run"]);
      assert.equal(report.authStatus.items[0].canRunReal, false);
      assert.equal(report.authStatus.items[0].runtimeStatus, "online");
    });
  });

  it("renders a markdown handoff for dependent projects", async () => {
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: {
            summary: { total: 1, ready: 1, needs_action: 0, reserved: 0, blocked: 0, next_actions: 0 },
            items: [{ platform: "google_search_console", status: "ready", reason: "private-api-client+public-check", action: "无需处理" }],
            nextActions: []
          }
        }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: []
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /AI Link Auth Status Next Actions/);
      assert.match(result.stdout, /No platform authorization action is needed/);
      assert.match(result.stdout, /google_search_console/);
      assert.equal(result.stdout.includes("secret-codex-token"), false);
    });
  });
});
