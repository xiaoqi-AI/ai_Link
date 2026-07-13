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
      AI_LINK_AUTH_HUB_ALLOWED_HOSTS: "",
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

function completeAuthStatus(authStatus) {
  return {
    schemaVersion: "2",
    ...authStatus,
    summary: {
      action_tasks_complete: true,
      action_tasks_truncated: false,
      ...authStatus.summary
    }
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

describe("Auth status next action client", () => {
  it("renders public-safe next actions from Auth Hub", async () => {
    await withServer((req, res) => {
      assert.equal(req.headers.authorization, "Bearer secret-codex-token");
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: completeAuthStatus({
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
          })
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

  it("never attaches Service Auth credentials to loopback status checks", async () => {
    await withServer((req, res) => {
      assert.equal(req.headers["cf-access-client-id"], undefined);
      assert.equal(req.headers["cf-access-client-secret"], undefined);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        authStatus: completeAuthStatus({
          summary: { total: 0, ready: 0, next_actions: 0 },
          items: [],
          nextActions: []
        })
      }));
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "loopback-token",
          CF_ACCESS_CLIENT_ID: "must-not-forward",
          CF_ACCESS_CLIENT_SECRET: "must-not-forward"
        }
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).summary.reachable, true);
    });
  });

  it("rejects unapproved remote targets before sending bearer or Service Auth credentials", async () => {
    const result = await runStatus({
      baseUrl: "https://unapproved.example.invalid",
      env: {
        AI_LINK_CODEX_TOKEN: "must-not-send",
        CF_ACCESS_CLIENT_ID: "must-not-send",
        CF_ACCESS_CLIENT_SECRET: "must-not-send"
      }
    });
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.reachable, false);
    assert.equal(report.summary.monitoringIssue, "auth_hub_target_rejected");
    assert.match(report.blockers[0], /explicitly approved HTTPS Auth Hub hostname/);
  });

  it("does not follow Auth Hub redirects", async () => {
    let redirectedRequests = 0;
    await withServer((req, res) => {
      if (req.url === "/redirected") {
        redirectedRequests += 1;
        res.end("unexpected");
        return;
      }
      res.statusCode = 302;
      res.setHeader("location", "/redirected");
      res.end();
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "redirect-token" }
      });
      const report = JSON.parse(result.stdout);
      assert.equal(report.summary.monitoringIssue, "auth_status_http_error");
      assert.equal(redirectedRequests, 0);
    });
  });

  it("fails closed in strict mode when executor or probe evidence is unverified", async () => {
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: completeAuthStatus({
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
          })
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
          authStatus: completeAuthStatus({
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
          })
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
      assert.deepEqual(report.authStatus.summary, {
        total: 1,
        ready: 1,
        unverified: 0,
        needs_action: 0,
        reserved: 0,
        blocked: 0,
        next_actions: 0,
        action_tasks_complete: true,
        action_tasks_truncated: false
      });
      assert.deepEqual(report.authStatus.items[0].verifiedOperations, ["check_auth"]);
      assert.equal(report.authStatus.items[0].probe.status, "verified");
      assert.equal(result.stdout.includes("must-not-leak"), false);
    });
  });

  it("fails closed unless every dependent-project operation is exactly verified", async () => {
    const exactTarget = "xiaoqi-AI/ai_Link";
    let targetVerificationRequests = 0;
    await withServer(async (req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: completeAuthStatus({
            summary: { total: 2, ready: 1, unverified: 1, next_actions: 0 },
            items: [
              {
                platform: "github",
                status: "ready",
                verifiedOperations: ["check_auth:repo_read:target_verification_required:v1"],
                reason: "probe_verified"
              },
              {
                platform: "xiaohongshu",
                status: "unverified",
                verifiedOperations: [],
                reason: "probe_not_run"
              }
            ],
            nextActions: []
          })
        }));
        return;
      }
      if (req.url === "/api/auth-status/verify-targets") {
        targetVerificationRequests += 1;
        assert.equal(req.method, "POST");
        assert.equal(req.headers.authorization, "Bearer secret-codex-token");
        const body = await readJsonBody(req);
        const requirement = body.requirements[0];
        const suppliedTarget = `${requirement.target.owner}/${requirement.target.repo}`.toLowerCase();
        const verified = suppliedTarget === exactTarget.toLowerCase();
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          targetVerification: {
            schemaVersion: "1",
            results: [{
              platform: "github",
              operation: `check_auth:${requirement.qualifier}:target_bound`,
              status: verified ? "verified" : "unverified",
              reason: verified ? "target_probe_verified" : "target_probe_unverified"
            }]
          }
        }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const verified = await runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "secret-codex-token",
          AI_LINK_GITHUB_REPOSITORY: exactTarget
        },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:repo_read:target_bound",
          "--github-target-env",
          "AI_LINK_GITHUB_REPOSITORY"
        ]
      });
      const verifiedReport = JSON.parse(verified.stdout);
      assert.equal(verified.status, 0, verified.stderr);
      assert.equal(verifiedReport.schemaVersion, "1");
      assert.deepEqual(verifiedReport.target.platforms, ["github"]);
      assert.deepEqual(verifiedReport.target.requiredOperations, [{
        platform: "github",
        operation: "check_auth:repo_read:target_bound"
      }]);
      assert.deepEqual(verifiedReport.operationRequirements, [{
        platform: "github",
        operation: "check_auth:repo_read:target_bound",
        status: "verified",
        reason: "target_probe_verified"
      }]);
      assert.equal(targetVerificationRequests, 1);

      const wrongTarget = await runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "secret-codex-token",
          AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/other-private-repo"
        },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:repo_read:target_bound",
          "--github-target-env",
          "AI_LINK_GITHUB_REPOSITORY"
        ]
      });
      const wrongTargetReport = JSON.parse(wrongTarget.stdout);
      assert.equal(wrongTarget.status, 1, wrongTarget.stderr);
      assert.equal(wrongTargetReport.operationRequirements[0].status, "target_unverified");
      assert.deepEqual(wrongTargetReport.blockers, [
        "github: target_probe_unverified:check_auth:repo_read:target_bound"
      ]);
      assert.equal(wrongTarget.stdout.includes("other-private-repo"), false);

      const missingTarget = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:repo_read:target_bound"
        ]
      });
      const missingTargetReport = JSON.parse(missingTarget.stdout);
      assert.equal(missingTarget.status, 1, missingTarget.stderr);
      assert.equal(missingTargetReport.operationRequirements[0].status, "target_missing");
      assert.equal(missingTargetReport.operationRequirements[0].reason, "github_target_required");
      assert.equal(targetVerificationRequests, 2);

      const invalidTarget = await runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "secret-codex-token",
          AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/ai_Link/extra"
        },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:repo_read:target_bound",
          "--github-target-env",
          "AI_LINK_GITHUB_REPOSITORY"
        ]
      });
      const invalidTargetReport = JSON.parse(invalidTarget.stdout);
      assert.equal(invalidTarget.status, 1, invalidTarget.stderr);
      assert.equal(invalidTargetReport.operationRequirements[0].status, "target_invalid");
      assert.equal(invalidTargetReport.operationRequirements[0].reason, "github_target_configuration_invalid");
      assert.equal(invalidTarget.stdout.includes("ai_Link/extra"), false);
      assert.equal(targetVerificationRequests, 2);

      const wrongScope = await runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "secret-codex-token",
          AI_LINK_GITHUB_REPOSITORY: exactTarget
        },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:actions_read:target_bound",
          "--github-target-env",
          "AI_LINK_GITHUB_REPOSITORY"
        ]
      });
      const wrongScopeReport = JSON.parse(wrongScope.stdout);
      assert.equal(wrongScope.status, 1, wrongScope.stderr);
      assert.equal(wrongScopeReport.summary.ok, false);
      assert.deepEqual(wrongScopeReport.blockers, [
        "github: required_operation_unverified:check_auth:actions_read:target_bound"
      ]);
      assert.equal(wrongScopeReport.operationRequirements[0].status, "operation_unverified");
      assert.match(wrongScopeReport.summary.recommendedNext, /every required operation/);
    });
  });

  it("does not trust an old or malformed exact-target verification endpoint", async () => {
    let mode = "missing";
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: completeAuthStatus({
            summary: { total: 1, ready: 1, next_actions: 0 },
            items: [{
              platform: "github",
              status: "ready",
              verifiedOperations: ["check_auth:repo_read:target_bound"],
              reason: "probe_verified"
            }],
            nextActions: []
          })
        }));
        return;
      }
      if (req.url === "/api/auth-status/verify-targets" && mode === "malformed") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          targetVerification: {
            schemaVersion: "1",
            results: [{
              platform: "github",
              operation: "check_auth:repo_read:target_bound",
              status: "verified",
              reason: "target_probe_verified",
              target: "private-target-must-not-leak"
            }]
          }
        }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const runExact = () => runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "secret-codex-token",
          AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/ai_Link"
        },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:repo_read:target_bound",
          "--github-target-env",
          "AI_LINK_GITHUB_REPOSITORY"
        ]
      });

      const oldServer = await runExact();
      const oldReport = JSON.parse(oldServer.stdout);
      assert.equal(oldServer.status, 1, oldServer.stderr);
      assert.equal(oldReport.operationRequirements[0].status, "target_coverage_unverified");
      assert.equal(oldReport.operationRequirements[0].reason, "target_verification_http_error");

      mode = "malformed";
      const malformed = await runExact();
      const malformedReport = JSON.parse(malformed.stdout);
      assert.equal(malformed.status, 1, malformed.stderr);
      assert.equal(malformedReport.operationRequirements[0].reason, "target_verification_invalid_response");
      assert.equal(malformed.stdout.includes("private-target-must-not-leak"), false);
    });
  });

  it("rejects malformed operation requirements", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        authStatus: completeAuthStatus({
          summary: { total: 0, ready: 0, next_actions: 0 },
          items: [],
          nextActions: []
        })
      }));
    }, async (baseUrl) => {
      for (const requirement of [
        "github/check_auth",
        "github=check_auth:repo_read:target_verification_required:v1"
      ]) {
        const result = await runStatus({
          baseUrl,
          env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
          args: ["--json", "--strict", "--require-operation", requirement]
        });
        const report = JSON.parse(result.stdout);
        assert.equal(result.status, 1, result.stderr);
        assert.deepEqual(report.blockers, ["invalid_operation_requirement"]);
      }
    });
  });

  it("rejects a dangling operation requirement instead of silently ignoring it", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        authStatus: completeAuthStatus({
          summary: { total: 0, ready: 0, next_actions: 0 },
          items: [],
          nextActions: []
        })
      }));
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: ["--json", "--strict", "--require-operation"]
      });
      const report = JSON.parse(result.stdout);
      assert.equal(result.status, 1, result.stderr);
      assert.deepEqual(report.blockers, ["invalid_operation_requirement"]);
    });
  });

  it("fails closed for old, missing, or contradictory action-task coverage", async () => {
    let authStatus = {
      schemaVersion: "1",
      summary: { total: 1, ready: 1, next_actions: 0, action_tasks_complete: true, action_tasks_truncated: false },
      items: [{ platform: "github", status: "ready", reason: "probe_verified" }],
      nextActions: []
    };
    await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ authStatus }));
    }, async (baseUrl) => {
      const runStrict = () => runStatus({
        baseUrl,
        env: { AI_LINK_CODEX_TOKEN: "secret-codex-token" },
        args: ["--json", "--strict", "--platform", "github"]
      });

      const oldSchemaResult = await runStrict();
      const oldSchema = JSON.parse(oldSchemaResult.stdout);
      assert.equal(oldSchemaResult.status, 1, oldSchemaResult.stderr);
      assert.deepEqual(oldSchema.blockers, ["auth_hub: action_task_coverage_unverified"]);

      authStatus = {
        schemaVersion: "2",
        summary: { total: 1, ready: 1, next_actions: 0 },
        items: authStatus.items,
        nextActions: []
      };
      const missingCoverageResult = await runStrict();
      const missingCoverage = JSON.parse(missingCoverageResult.stdout);
      assert.equal(missingCoverageResult.status, 1, missingCoverageResult.stderr);
      assert.deepEqual(missingCoverage.blockers, ["auth_hub: action_task_coverage_unverified"]);

      authStatus.summary = {
        total: 1,
        ready: 1,
        next_actions: 0,
        action_tasks_complete: true,
        action_tasks_truncated: true
      };
      const contradictoryResult = await runStrict();
      const contradictory = JSON.parse(contradictoryResult.stdout);
      assert.equal(contradictoryResult.status, 1, contradictoryResult.stderr);
      assert.deepEqual(contradictory.blockers, ["auth_hub: action_task_list_truncated"]);
    });
  });

  it("fails closed when Auth Hub action coverage is truncated", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        authStatus: completeAuthStatus({
          summary: {
            total: 1,
            ready: 1,
            next_actions: 0,
            action_tasks_complete: false,
            action_tasks_truncated: true
          },
          items: [{
            platform: "github",
            status: "ready",
            verifiedOperations: ["check_auth:repo_read:target_bound"],
            reason: "probe_verified"
          }],
          nextActions: []
        })
      }));
    }, async (baseUrl) => {
      const result = await runStatus({
        baseUrl,
        env: {
          AI_LINK_CODEX_TOKEN: "secret-codex-token",
          AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/ai_Link"
        },
        args: [
          "--json",
          "--strict",
          "--require-operation",
          "github=check_auth:repo_read:target_bound",
          "--github-target-env",
          "AI_LINK_GITHUB_REPOSITORY"
        ]
      });
      const report = JSON.parse(result.stdout);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(report.summary.ok, false);
      assert.deepEqual(report.blockers, ["auth_hub: action_task_list_truncated"]);
      assert.equal(report.authStatus.summary.action_tasks_complete, false);
    });
  });

  it("fails strict mode for selected manual actions and missing platforms", async () => {
    await withServer((req, res) => {
      if (req.url === "/api/auth-status") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          authStatus: completeAuthStatus({
            summary: { total: 1, ready: 0, needs_action: 1, next_actions: 1 },
            items: [{ platform: "github", status: "needs_action", reason: "credential_missing" }],
            nextActions: [{
              platform: "github",
              status: "needs_action",
              reason: "credential_missing",
              severity: "manual"
            }]
          })
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
          authStatus: completeAuthStatus({
            summary: { total: 1, ready: 1, needs_action: 0, reserved: 0, blocked: 0, next_actions: 0 },
            items: [{ platform: "google_search_console", status: "ready", reason: "private-api-client+public-check", action: "无需处理" }],
            nextActions: []
          })
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

  it("documents a real executable cross-project handoff without reusing the content-site domain", async () => {
    const [guide, handoff] = await Promise.all([
      readFile("docs/user-guide.md", "utf8"),
      readFile("docs/project-ledger/session-2026-07-12-auth-status-client-handoff.md", "utf8")
    ]);

    assert.match(guide, /--require-operation/);
    assert.match(guide, /--github-target-env AI_LINK_GITHUB_REPOSITORY/);
    assert.match(guide, /POST \/api\/auth-status\/verify-targets/);
    assert.match(guide, /operationRequirements\[\]\.status=verified/);
    assert.match(handoff, /npm\.cmd --prefix \$env:AI_LINK_HOME/);
    assert.match(handoff, /<approved-auth-hub-url>/);
    assert.match(handoff, /--github-target-env AI_LINK_GITHUB_REPOSITORY/);
    assert.doesNotMatch(handoff, /AI_LINK_BASE_URL="https:\/\/voice\.xiao-qi-ai\.com"/);
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
        res.end(JSON.stringify({ ...response, authStatus: completeAuthStatus(response.authStatus) }));
      }, async (baseUrl) => {
        const runWatch = () => runStatus({
          baseUrl,
          env: {
            AI_LINK_CODEX_TOKEN: "secret-codex-token",
            AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/ai_Link"
          },
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
          kind: "action",
          operation: "",
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

  it("tracks multiple operation failures and a manual action for one platform independently", async () => {
    const stateFile = path.join("runtime", "tmp", `auth-status-multi-signal-${process.pid}-${Date.now()}.json`);
    let response = {
      authStatus: {
        summary: { total: 1, ready: 1, next_actions: 0 },
        items: [{
          platform: "github",
          status: "ready",
          reason: "probe_verified",
          verifiedOperations: []
        }],
        nextActions: []
      }
    };
    try {
      await withServer((req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ...response, authStatus: completeAuthStatus(response.authStatus) }));
      }, async (baseUrl) => {
        const runWatch = () => runStatus({
          baseUrl,
          env: {
            AI_LINK_CODEX_TOKEN: "secret-codex-token",
            AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/ai_Link"
          },
          args: [
            "--watch",
            "--json",
            "--state-file",
            stateFile,
            "--require-operation",
            "github=check_auth:repo_read:target_bound",
            "--require-operation",
            "github=check_auth:actions_read:target_bound",
            "--github-target-env",
            "AI_LINK_GITHUB_REPOSITORY"
          ]
        });

        const baseline = JSON.parse((await runWatch()).stdout);
        assert.equal(baseline.baseline, true);
        assert.equal(baseline.summary.activeSignals, 2);
        const storedBaseline = JSON.parse(await readFile(stateFile, "utf8"));
        assert.equal(storedBaseline.schemaVersion, 3);
        assert.deepEqual(storedBaseline.signals.map((signal) => signal.operation), [
          "check_auth:actions_read:target_bound",
          "check_auth:repo_read:target_bound"
        ]);

        response = {
          authStatus: completeAuthStatus({
            summary: { total: 1, needs_action: 1, next_actions: 1 },
            items: [{ platform: "github", status: "needs_action", reason: "credential_missing" }],
            nextActions: [{
              platform: "github",
              status: "needs_action",
              severity: "manual",
              reason: "credential_missing"
            }]
          })
        };
        const changed = JSON.parse((await runWatch()).stdout);
        assert.equal(changed.notify, true);
        assert.equal(changed.summary.activeSignals, 3);
        assert.deepEqual(changed.newSignals, [{
          platform: "github",
          kind: "action",
          operation: "",
          status: "needs_action",
          severity: "manual",
          reason: "credential_missing"
        }]);
        assert.equal(changed.summary.updatedSignals, 2);
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
        res.end(JSON.stringify({ ...response, authStatus: completeAuthStatus(response.authStatus) }));
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
          status: "needs_action",
          severity: "approval",
          reason: "interactive_approval_required"
        };
        response.authStatus.items[0] = {
          platform: "xiaohongshu",
          status: "needs_action",
          reason: "interactive_approval_required"
        };
        const approval = JSON.parse((await runWatch()).stdout);
        assert.equal(approval.notify, true);
        assert.equal(approval.reason, "worsened_attention_required");
        assert.equal(approval.summary.worsenedSignals, 1);

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
        authStatus: completeAuthStatus({
          summary: { total: 1, ready: 1, next_actions: 0 },
          items: [{ platform: "github", status: "ready", reason: "probe_verified" }],
          nextActions: []
        })
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

  it("keeps watcher baselines isolated by the normalized private GitHub target", async () => {
    const stateFile = path.join("runtime", "tmp", `auth-status-target-scope-${process.pid}-${Date.now()}.json`);
    const requestUrls = [];
    try {
      await withServer(async (req, res) => {
        requestUrls.push(req.url);
        if (req.url === "/api/auth-status") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            authStatus: completeAuthStatus({
              summary: { total: 1, ready: 1, next_actions: 0 },
              items: [{
                platform: "github",
                status: "ready",
                verifiedOperations: ["check_auth:repo_read:target_verification_required:v1"],
                reason: "probe_verified"
              }],
              nextActions: []
            })
          }));
          return;
        }
        if (req.url === "/api/auth-status/verify-targets") {
          const body = await readJsonBody(req);
          const qualifier = body.requirements[0].qualifier;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            targetVerification: {
              schemaVersion: "1",
              results: [{
                platform: "github",
                operation: `check_auth:${qualifier}:target_bound`,
                status: "verified",
                reason: "target_probe_verified"
              }]
            }
          }));
          return;
        }
        res.statusCode = 404;
        res.end("not found");
      }, async (baseUrl) => {
        const runTargetWatch = (target) => runStatus({
          baseUrl,
          env: {
            AI_LINK_CODEX_TOKEN: "secret-codex-token",
            AI_LINK_GITHUB_REPOSITORY: target
          },
          args: [
            "--watch",
            "--json",
            "--state-file",
            stateFile,
            "--require-operation",
            "github=check_auth:repo_read:target_bound",
            "--github-target-env",
            "AI_LINK_GITHUB_REPOSITORY"
          ]
        });

        const first = JSON.parse((await runTargetWatch("xiaoqi-AI/ai_Link")).stdout);
        assert.equal(first.baseline, true);
        const baseline = await readFile(stateFile, "utf8");
        assert.equal(baseline.toLowerCase().includes("xiaoqi-ai"), false);
        assert.equal(baseline.toLowerCase().includes("ai_link"), false);

        const sameNormalized = JSON.parse((await runTargetWatch("XIAOQI-ai/AI_link")).stdout);
        assert.equal(sameNormalized.monitoringOk, true);
        assert.equal(sameNormalized.baseline, false);
        const currentBaseline = await readFile(stateFile, "utf8");

        const changedTargetResult = await runTargetWatch("xiaoqi-AI/another-private-repo");
        const changedTarget = JSON.parse(changedTargetResult.stdout);
        assert.equal(changedTargetResult.status, 1);
        assert.equal(changedTarget.monitoringOk, false);
        assert.equal(changedTarget.reason, "state_scope_mismatch");
        assert.equal(await readFile(stateFile, "utf8"), currentBaseline);
        assert.ok(requestUrls.every((url) => !url.toLowerCase().includes("xiaoqi-ai")));
        assert.ok(requestUrls.every((url) => !url.toLowerCase().includes("private-repo")));
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
    const operationStateFile = path.join("runtime", "tmp", `auth-status-operation-${process.pid}-${Date.now()}.json`);
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
        res.end(JSON.stringify({ ...response, authStatus: completeAuthStatus(response.authStatus) }));
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

        const runOperationWatch = (operation) => runStatus({
          baseUrl,
          env: {
            AI_LINK_CODEX_TOKEN: "secret-codex-token",
            AI_LINK_GITHUB_REPOSITORY: "xiaoqi-AI/ai_Link"
          },
          args: [
            "--watch",
            "--json",
            "--state-file",
            operationStateFile,
            "--require-operation",
            `github=${operation}`,
            "--github-target-env",
            "AI_LINK_GITHUB_REPOSITORY"
          ]
        });
        const operationBaseline = JSON.parse((await runOperationWatch("check_auth:repo_read:target_bound")).stdout);
        assert.equal(operationBaseline.baseline, true);
        const operationMismatchResult = await runOperationWatch("check_auth:actions_read:target_bound");
        const operationMismatch = JSON.parse(operationMismatchResult.stdout);
        assert.equal(operationMismatchResult.status, 1);
        assert.equal(operationMismatch.reason, "state_scope_mismatch");

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
      await rm(operationStateFile, { force: true });
      await rm(outside, { force: true });
    }
  });
});
