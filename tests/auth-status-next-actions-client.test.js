import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
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

  it("checks only requested platforms and preserves operation-scoped evidence", async () => {
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: {
            summary: { total: 2, ready: 1, unverified: 1, next_actions: 0 },
            items: [
              {
                platform: "github",
                status: "ready",
                connectorStatus: "available",
                mode: "private",
                runtimeStatus: "online",
                operationalStatus: "verified",
                canRunReal: true,
                verifiedOperations: ["check_auth"],
                probe: {
                  status: "verified",
                  checkedAt: "2026-07-13T04:00:00.000Z",
                  expiresAt: "2026-07-13T04:15:00.000Z",
                  attemptId: "must-not-leak",
                  heartbeatRevision: "must-not-leak"
                },
                reason: "probe_verified",
                action: "无需处理"
              },
              {
                platform: "xiaohongshu",
                status: "unverified",
                reason: "probe_not_run",
                action: "尚未探测"
              }
            ],
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
        args: ["--json", "--strict", "--platform", "github"]
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.deepEqual(report.target.platforms, ["github"]);
      assert.deepEqual(report.authStatus.items.map((item) => item.platform), ["github"]);
      assert.deepEqual(report.authStatus.items[0].verifiedOperations, ["check_auth"]);
      assert.equal(report.authStatus.items[0].probe.status, "verified");
      assert.equal(result.stdout.includes("must-not-leak"), false);
    });
  });

  it("fails strict mode for selected manual actions and missing platforms", async () => {
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: {
            summary: { total: 1, ready: 0, needs_action: 1, next_actions: 1 },
            items: [{ platform: "github", status: "needs_action", reason: "credential_missing" }],
            nextActions: [{
              platform: "github",
              status: "needs_action",
              reason: "credential_missing",
              severity: "manual"
            }]
          }
        }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const manual = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: ["--json", "--strict", "--platform", "github"]
      });
      assert.equal(manual.status, 1, manual.stderr);
      assert.deepEqual(JSON.parse(manual.stdout).blockers, ["github: credential_missing"]);

      const missing = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: ["--json", "--strict", "--platform", "wechat_official"]
      });
      assert.equal(missing.status, 1, missing.stderr);
      assert.deepEqual(JSON.parse(missing.stdout).blockers, ["wechat_official: missing_from_auth_status"]);

      const invalid = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: ["--json", "--strict", "--platform", "GitHub!"]
      });
      assert.equal(invalid.status, 1, invalid.stderr);
      assert.deepEqual(JSON.parse(invalid.stdout).blockers, ["invalid_platform_filter"]);
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

  it("creates a quiet baseline and alerts only for a new normalized next action", async () => {
    const stateFile = path.join("runtime", "tmp", `auth-status-watch-${process.pid}-${Date.now()}.json`);
    let response = {
      authStatus: {
        summary: { total: 1, ready: 1, next_actions: 0 },
        items: [{
          platform: "github",
          status: "ready",
          reason: "probe_verified",
          probe: { status: "verified", checkedAt: "2026-07-13T01:00:00.000Z" }
        }],
        nextActions: []
      }
    };

    try {
      await withServer((req, res) => {
        if (req.url !== "/api/auth-status") {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(response));
      }, async (baseUrl) => {
        const runWatch = () => runStatus({
          baseUrl,
          env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
          args: ["--watch", "--json", "--state-file", stateFile]
        });

        const baseline = JSON.parse((await runWatch()).stdout);
        assert.equal(baseline.baseline, true);
        assert.equal(baseline.changed, false);
        assert.equal(baseline.notify, false);
        assert.equal(baseline.monitoringAlert, false);
        assert.equal(baseline.reason, "baseline_created");

        response = {
          authStatus: {
            summary: { total: 2, ready: 1, unverified: 1, next_actions: 0 },
            items: [
              {
                platform: "xiaohongshu",
                status: "unverified",
                reason: "probe_not_run"
              },
              {
                ...response.authStatus.items[0],
                probe: { status: "verified", checkedAt: "2026-07-13T01:05:00.000Z" }
              }
            ],
            nextActions: []
          }
        };
        const unchanged = JSON.parse((await runWatch()).stdout);
        assert.equal(unchanged.changed, false);
        assert.equal(unchanged.notify, false);
        assert.equal(unchanged.reason, "unchanged");

        response = {
          authStatus: {
            summary: { total: 2, ready: 1, needs_action: 1, next_actions: 1 },
            items: [
              {
                platform: "xiaohongshu",
                status: "needs_action",
                reason: "login_expired",
                account: "must-not-be-stored"
              },
              response.authStatus.items[1]
            ],
            nextActions: [{
              platform: "xiaohongshu",
              status: "needs_action",
              reason: "login_expired",
              severity: "manual",
              title: "must-not-be-stored",
              runbook: "must-not-be-stored",
              relatedTaskIds: ["task_private"],
              cookie: "must-not-be-stored"
            }]
          }
        };
        const alert = JSON.parse((await runWatch()).stdout);
        assert.equal(alert.changed, true);
        assert.equal(alert.notify, true);
        assert.equal(alert.reason, "new_attention_required");
        assert.deepEqual(alert.newSignals, [{
          platform: "xiaohongshu",
          status: "needs_action",
          severity: "manual",
          reason: "login_expired"
        }]);

        const stored = await readFile(stateFile, "utf8");
        for (const secret of ["secret-codex-token", "must-not-be-stored", "task_private", baseUrl]) {
          assert.equal(stored.includes(secret), false);
          assert.equal(alert.newSignals.some((signal) => JSON.stringify(signal).includes(secret)), false);
        }

        response = {
          authStatus: {
            summary: { total: 1, ready: 1, next_actions: 0 },
            items: [response.authStatus.items[1]],
            nextActions: []
          }
        };
        const resolved = JSON.parse((await runWatch()).stdout);
        assert.equal(resolved.changed, true);
        assert.equal(resolved.notify, false);
        assert.equal(resolved.reason, "resolved_without_alert");
        assert.equal(resolved.summary.resolvedSignals, 1);
      });
    } finally {
      await rm(stateFile, { force: true });
    }
  });

  it("alerts on worsening but not same-rank reason changes or improvement", async () => {
    const stateFile = path.join("runtime", "tmp", `auth-status-direction-${process.pid}-${Date.now()}.json`);
    let response = {
      authStatus: {
        summary: { total: 1, needs_action: 1, next_actions: 1 },
        items: [{ platform: "xiaohongshu", status: "needs_action", reason: "login_expired" }],
        nextActions: [{ platform: "xiaohongshu", status: "needs_action", severity: "manual", reason: "login_expired" }]
      }
    };
    try {
      await withServer((req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(response));
      }, async (baseUrl) => {
        const runWatch = () => runStatus({
          baseUrl,
          env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
          args: ["--watch", "--json", "--state-file", stateFile]
        });
        assert.equal(JSON.parse((await runWatch()).stdout).notify, false);

        response.authStatus.nextActions[0].reason = "session_expired";
        response.authStatus.items[0].reason = "session_expired";
        const changed = JSON.parse((await runWatch()).stdout);
        assert.equal(changed.changed, true);
        assert.equal(changed.notify, false);
        assert.equal(changed.reason, "changed_without_alert");
        assert.equal(changed.summary.updatedSignals, 1);

        response.authStatus.nextActions[0] = {
          platform: "xiaohongshu",
          status: "blocked",
          severity: "blocked",
          reason: "account_risk_control"
        };
        response.authStatus.items[0] = {
          platform: "xiaohongshu",
          status: "blocked",
          reason: "account_risk_control"
        };
        const worsened = JSON.parse((await runWatch()).stdout);
        assert.equal(worsened.notify, true);
        assert.equal(worsened.reason, "worsened_attention_required");
        assert.equal(worsened.summary.worsenedSignals, 1);

        response.authStatus.nextActions[0] = {
          platform: "xiaohongshu",
          status: "needs_action",
          severity: "manual",
          reason: "login_expired"
        };
        response.authStatus.items[0] = {
          platform: "xiaohongshu",
          status: "needs_action",
          reason: "login_expired"
        };
        const improved = JSON.parse((await runWatch()).stdout);
        assert.equal(improved.changed, true);
        assert.equal(improved.notify, false);
        assert.equal(improved.reason, "changed_without_alert");
      });
    } finally {
      await rm(stateFile, { force: true });
    }
  });

  it("does not establish a baseline when the read-only monitor cannot authenticate", async () => {
    const stateFile = path.join("runtime", "tmp", `auth-status-failed-${process.pid}-${Date.now()}.json`);
    const result = await runStatus({
      args: ["--watch", "--json", "--state-file", stateFile]
    });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1);
    assert.equal(report.monitoringOk, false);
    assert.equal(report.monitoringAlert, true);
    assert.equal(report.notify, false);
    assert.equal(report.reason, "missing_read_token");
    await assert.rejects(readFile(stateFile, "utf8"), { code: "ENOENT" });
  });

  it("does not create or advance a baseline for malformed HTTP 200 responses", async () => {
    const stateFile = path.join("runtime", "tmp", `auth-status-invalid-response-${process.pid}-${Date.now()}.json`);
    let response = {
      body: JSON.stringify({
        authStatus: {
          summary: { total: 1, ready: 1, next_actions: 0 },
          items: [{ platform: "github", status: "ready", reason: "probe_verified" }],
          nextActions: []
        }
      }),
      contentType: "application/json"
    };
    try {
      await withServer((req, res) => {
        res.setHeader("content-type", response.contentType);
        res.end(response.body);
      }, async (baseUrl) => {
        const runWatch = () => runStatus({
          baseUrl,
          env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
          args: ["--watch", "--json", "--state-file", stateFile]
        });
        assert.equal(JSON.parse((await runWatch()).stdout).baseline, true);
        const baseline = await readFile(stateFile, "utf8");

        const invalidResponses = [
          { contentType: "text/html", body: "<html>access page</html>" },
          { contentType: "application/json", body: "{}" },
          {
            contentType: "application/json",
            body: JSON.stringify({ authStatus: { summary: {}, items: {}, nextActions: [] } })
          }
        ];
        for (const invalid of invalidResponses) {
          response = invalid;
          const result = await runWatch();
          const report = JSON.parse(result.stdout);
          assert.equal(result.status, 1);
          assert.equal(report.monitoringOk, false);
          assert.equal(report.monitoringAlert, true);
          assert.equal(report.notify, false);
          assert.equal(report.reason, "auth_status_invalid_response");
          assert.equal(await readFile(stateFile, "utf8"), baseline);
        }
      });
    } finally {
      await rm(stateFile, { force: true });
    }
  });

  it("rejects public paths, scope reuse, corrupt snapshots, and unexpected fields", async () => {
    const outside = `auth-status-public-${process.pid}.json`;
    const rejected = await runStatus({
      env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
      args: ["--watch", "--json", "--state-file", outside]
    });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /state file must stay under runtime\/private or runtime\/tmp/);

    const stateFile = path.join("runtime", "tmp", `auth-status-corrupt-${process.pid}-${Date.now()}.json`);
    const tamperedFile = path.join("runtime", "tmp", `auth-status-tampered-${process.pid}-${Date.now()}.json`);
    let response = {
      authStatus: {
        summary: { total: 2, ready: 2, next_actions: 0 },
        items: [
          { platform: "github", status: "ready", reason: "probe_verified" },
          { platform: "xiaohongshu", status: "ready", reason: "probe_verified" }
        ],
        nextActions: []
      }
    };
    try {
      await withServer((req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(response));
      }, async (baseUrl) => {
        const runWatch = (file, platforms = []) => runStatus({
          baseUrl,
          env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
          args: ["--watch", "--json", "--state-file", file, ...platforms.flatMap((platform) => ["--platform", platform])]
        });

        const scopedBaseline = JSON.parse((await runWatch(stateFile, ["github"])).stdout);
        assert.equal(scopedBaseline.baseline, true);
        const mismatchResult = await runWatch(stateFile, ["xiaohongshu"]);
        const mismatch = JSON.parse(mismatchResult.stdout);
        assert.equal(mismatchResult.status, 1);
        assert.equal(mismatch.monitoringAlert, true);
        assert.equal(mismatch.notify, false);
        assert.equal(mismatch.reason, "state_scope_mismatch");

        await writeFile(stateFile, "{not-json", "utf8");
        const corruptResult = await runWatch(stateFile, ["github"]);
        const corrupt = JSON.parse(corruptResult.stdout);
        assert.equal(corruptResult.status, 1);
        assert.equal(corrupt.monitoringAlert, true);
        assert.equal(corrupt.notify, false);
        assert.equal(corrupt.reason, "state_unreadable");
        assert.equal(await readFile(stateFile, "utf8"), "{not-json");

        response = {
          authStatus: {
            summary: { total: 1, needs_action: 1, next_actions: 1 },
            items: [{ platform: "github", status: "needs_action", reason: "credential_missing" }],
            nextActions: [{ platform: "github", status: "needs_action", severity: "manual", reason: "credential_missing" }]
          }
        };
        assert.equal(JSON.parse((await runWatch(tamperedFile, ["github"])).stdout).baseline, true);
        const snapshot = JSON.parse(await readFile(tamperedFile, "utf8"));
        snapshot.signals[0].unexpectedField = "must-never-be-echoed";
        await writeFile(tamperedFile, JSON.stringify(snapshot), "utf8");
        const tamperedResult = await runWatch(tamperedFile, ["github"]);
        const tampered = JSON.parse(tamperedResult.stdout);
        assert.equal(tamperedResult.status, 1);
        assert.equal(tampered.monitoringAlert, true);
        assert.equal(tampered.notify, false);
        assert.equal(tampered.reason, "state_unreadable");
        assert.equal(tamperedResult.stdout.includes("must-never-be-echoed"), false);
      });
    } finally {
      await rm(stateFile, { force: true });
      await rm(tamperedFile, { force: true });
      await rm(outside, { force: true });
    }
  });
});
