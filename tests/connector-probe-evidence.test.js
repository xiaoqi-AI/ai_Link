import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { describeConnectorRuntime } from "../src/connectors/executorCapabilities.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import { hashToken } from "../src/security/auth.js";
import { MemoryStore } from "../src/storage/memoryStore.js";

const ADMIN_TOKEN = "test-probe-admin-token";
const CODEX_TOKEN = "test-probe-codex-token";
const EXECUTOR_TOKEN = "test-probe-executor-token";
const UNBOUND_EXECUTOR_TOKEN = "test-probe-unbound-executor-token";
const EXECUTOR_ID = "probe-executor";
const UNBOUND_EXECUTOR_ID = "unbound-probe-executor";
const EXECUTOR_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const WRONG_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const UNBOUND_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const FUTURE_CHECKED_AT = "2999-01-01T00:00:00.000Z";
const TOKEN_MARKER = "connector-probe-token-marker";
const RAW_MARKER = "connector-probe-raw-marker";

describe("connector probe evidence security", () => {
  let server;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("leases github/check_auth only to the bound trusted private executor session", async () => {
    const deniedProbe = await createProbeTask(server, { token: CODEX_TOKEN, expectedStatus: 403 });
    assert.equal(deniedProbe.error, "connector_probe_approval_required");
    const task = await createProbeTask(server);

    const mockHeartbeat = await reportHeartbeat(server, {
      token: EXECUTOR_TOKEN,
      heartbeat: githubHeartbeat({ mode: "mock" })
    });
    assert.equal(mockHeartbeat.response.status, 200);
    assert.equal(mockHeartbeat.data.trusted, true);
    assert.equal((await leaseProbe(server)).data.task, null);

    await addUnboundExecutorToken(server.store);
    const unboundHeartbeat = await reportHeartbeat(server, {
      token: UNBOUND_EXECUTOR_TOKEN,
      heartbeat: githubHeartbeat({
        executorId: UNBOUND_EXECUTOR_ID,
        executorSessionId: UNBOUND_SESSION_ID
      })
    });
    assert.equal(unboundHeartbeat.response.status, 200);
    assert.equal(unboundHeartbeat.data.trusted, false);
    assert.equal((await leaseProbe(server, {
      token: UNBOUND_EXECUTOR_TOKEN,
      executorId: UNBOUND_EXECUTOR_ID,
      executorSessionId: UNBOUND_SESSION_ID
    })).data.task, null);

    const sessionlessHeartbeat = await reportHeartbeat(server, {
      token: EXECUTOR_TOKEN,
      heartbeat: githubHeartbeat({ executorSessionId: "" })
    });
    assert.equal(sessionlessHeartbeat.response.status, 200);
    assert.equal(sessionlessHeartbeat.data.trusted, false);
    const sessionlessLease = await leaseProbe(server, { includeSession: false });
    assert.equal(sessionlessLease.response.status, 409);
    assert.equal(sessionlessLease.data.error, "executor_session_not_active");

    const privateHeartbeat = await reportHeartbeat(server, {
      token: EXECUTOR_TOKEN,
      heartbeat: githubHeartbeat()
    });
    assert.equal(privateHeartbeat.response.status, 200);
    assert.equal(privateHeartbeat.data.trusted, true);

    const impersonatedHeartbeat = await reportHeartbeat(server, {
      token: UNBOUND_EXECUTOR_TOKEN,
      heartbeat: githubHeartbeat()
    });
    assert.equal(impersonatedHeartbeat.response.status, 403);
    assert.equal(impersonatedHeartbeat.data.error, "executor_identity_reserved");

    const missingSessionLease = await leaseProbe(server, { includeSession: false });
    assert.equal(missingSessionLease.response.status, 409);
    assert.equal(missingSessionLease.data.error, "executor_session_not_active");
    const wrongSessionLease = await leaseProbe(server, { executorSessionId: WRONG_SESSION_ID });
    assert.equal(wrongSessionLease.response.status, 409);
    assert.equal(wrongSessionLease.data.error, "executor_session_not_active");

    const leased = await leaseProbe(server);
    assert.equal(leased.response.status, 200);
    assert.equal(leased.data.task.id, task.id);
    assert.equal(leased.data.task.status, "running");
    assert.ok(leased.data.task.leaseId);
    assertNoInternalProbeFields(leased.data);

    const internalLease = await server.store.getTask(task.id);
    assert.equal(internalLease.leasedBy, EXECUTOR_ID);
    assert.equal(internalLease.leaseExecutorSessionId, EXECUTOR_SESSION_ID);
    assert.ok(internalLease.leaseHeartbeatRevision);

    const settled = await submitProbeResult(server, task.id, {
      leaseId: leased.data.task.leaseId,
      status: "completed",
      result: githubResult({ status: "ready" })
    });
    assert.equal(settled.response.status, 200);
    assert.equal(settled.data.evidenceAccepted, true);
    assert.equal(settled.data.task.status, "completed");

    const evidence = await server.store.listConnectorProbeEvidence({ limit: 10 });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].executorId, EXECUTOR_ID);
    assert.equal(evidence[0].executorSessionId, EXECUTOR_SESSION_ID);
    assert.equal(evidence[0].attemptId, leased.data.task.leaseId);
    assert.equal(evidence[0].heartbeatRevision, internalLease.leaseHeartbeatRevision);
    assert.equal(evidence[0].outcome, "verified");

    const connectors = await requestJson(server.baseUrl, "/api/connectors", { token: CODEX_TOKEN });
    const github = runtimeGithub(connectors.data);
    assert.equal(github.probe.status, "verified");
    assert.deepEqual(github.verifiedOperations, ["check_auth"]);
    assert.equal(github.probe.operations[0].outcome, "verified");

    const authStatus = await requestJson(server.baseUrl, "/api/auth-status", { token: CODEX_TOKEN });
    const authGithub = authStatus.data.authStatus.items.find((item) => item.platform === "github");
    assert.equal(authGithub.status, "ready");
    assert.equal(authGithub.reason, "probe_verified");
    assert.deepEqual(authGithub.verifiedOperations, ["check_auth"]);
  });

  it("rejects missing or mismatched session, wrong lease, and replay without refreshing evidence", async () => {
    await reportHeartbeat(server, { token: EXECUTOR_TOKEN, heartbeat: githubHeartbeat() });
    const task = await createProbeTask(server);
    const leased = await leaseProbe(server);
    const leaseId = leased.data.task.leaseId;
    assert.equal(leased.data.task.id, task.id);

    const missingSession = await submitProbeResult(server, task.id, {
      leaseId,
      includeSession: false,
      status: "completed",
      result: githubResult({ status: "ready" })
    });
    assert.equal(missingSession.response.status, 409);
    assert.equal((await server.store.listConnectorProbeEvidence({ limit: 10 })).length, 0);

    const wrongSession = await submitProbeResult(server, task.id, {
      leaseId,
      executorSessionId: WRONG_SESSION_ID,
      status: "completed",
      result: githubResult({ status: "ready" })
    });
    assert.equal(wrongSession.response.status, 409);
    assert.equal((await server.store.listConnectorProbeEvidence({ limit: 10 })).length, 0);

    const wrongLease = await submitProbeResult(server, task.id, {
      leaseId: "wrong-lease-id",
      status: "completed",
      result: githubResult({ status: "ready" })
    });
    assert.equal(wrongLease.response.status, 409);
    assert.equal((await server.store.listConnectorProbeEvidence({ limit: 10 })).length, 0);

    const running = await requestJson(server.baseUrl, `/api/tasks/${task.id}`, { token: ADMIN_TOKEN });
    assert.equal(running.data.task.status, "running");

    const validEnvelope = {
      leaseId,
      status: "completed",
      result: githubResult({ status: "ready" })
    };
    const accepted = await submitProbeResult(server, task.id, validEnvelope);
    assert.equal(accepted.response.status, 200);

    const acceptedEvidence = await server.store.listConnectorProbeEvidence({ limit: 10 });
    assert.equal(acceptedEvidence.length, 1);
    assert.equal(acceptedEvidence[0].executorSessionId, EXECUTOR_SESSION_ID);
    const snapshot = structuredClone(acceptedEvidence);

    const replay = await submitProbeResult(server, task.id, validEnvelope);
    assert.equal(replay.response.status, 409);
    assert.deepEqual(await server.store.listConnectorProbeEvidence({ limit: 10 }), snapshot);
  });

  it("lets later trusted needs_action and blocked probes replace an older success", async () => {
    await reportHeartbeat(server, { token: EXECUTOR_TOKEN, heartbeat: githubHeartbeat() });

    const verified = await runTrustedProbe(server, {
      status: "completed",
      result: githubResult({ status: "ready" })
    });
    let evidence = await server.store.listConnectorProbeEvidence({ limit: 10 });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].taskId, verified.taskId);
    assert.equal(evidence[0].outcome, "verified");
    assert.equal((await githubAuthItem(server)).status, "ready");

    await delay(20);
    const needsAction = await runTrustedProbe(server, {
      status: "needs_action",
      result: githubResult({ status: "needs_action", issueCode: "credential_missing" })
    });
    evidence = await server.store.listConnectorProbeEvidence({ limit: 10 });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].taskId, needsAction.taskId);
    assert.equal(evidence[0].outcome, "action_required");
    let authGithub = await githubAuthItem(server);
    assert.equal(authGithub.status, "needs_action");
    assert.equal(authGithub.reason, "credential_missing");
    assert.deepEqual(authGithub.verifiedOperations, []);

    await delay(20);
    const blocked = await runTrustedProbe(server, {
      status: "failed",
      result: githubResult({ status: "blocked", issueCode: "credential_invalid" })
    });
    evidence = await server.store.listConnectorProbeEvidence({ limit: 10 });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].taskId, blocked.taskId);
    assert.equal(evidence[0].outcome, "blocked");
    authGithub = await githubAuthItem(server);
    assert.equal(authGithub.status, "blocked");
    assert.equal(authGithub.reason, "credential_invalid");
    assert.deepEqual(authGithub.verifiedOperations, []);
  });

  it("uses server evidence time and hides internal bindings plus private markers from API and UI", async () => {
    const heartbeat = await reportHeartbeat(server, {
      token: EXECUTOR_TOKEN,
      heartbeat: githubHeartbeat()
    });
    const task = await createProbeTask(server);
    const leased = await leaseProbe(server);
    const leaseId = leased.data.task.leaseId;
    const startedAt = Date.now();
    const submitted = await submitProbeResult(server, task.id, {
      leaseId,
      status: "completed",
      result: githubResult({
        status: "ready",
        checkedAt: FUTURE_CHECKED_AT,
        includePrivateMarkers: true
      })
    });
    const finishedAt = Date.now();
    assert.equal(submitted.response.status, 200);

    const [evidence] = await server.store.listConnectorProbeEvidence({ limit: 10 });
    const checkedAtMs = Date.parse(evidence.checkedAt);
    assert.ok(checkedAtMs >= startedAt);
    assert.ok(checkedAtMs <= finishedAt);
    assert.notEqual(evidence.checkedAt, FUTURE_CHECKED_AT);
    assert.ok(Date.parse(FUTURE_CHECKED_AT) > checkedAtMs);

    const taskList = await requestJson(server.baseUrl, "/api/tasks", { token: ADMIN_TOKEN });
    const taskDetail = await requestJson(server.baseUrl, `/api/tasks/${task.id}`, { token: ADMIN_TOKEN });
    const connectors = await requestJson(server.baseUrl, "/api/connectors", { token: CODEX_TOKEN });
    const authStatus = await requestJson(server.baseUrl, "/api/auth-status", { token: CODEX_TOKEN });
    const audit = await requestJson(server.baseUrl, `/api/audit?taskId=${task.id}`, { token: ADMIN_TOKEN });
    const operation = runtimeGithub(connectors.data).probe.operations[0];
    assert.equal(operation.checkedAt, evidence.checkedAt);
    assert.notEqual(operation.checkedAt, FUTURE_CHECKED_AT);

    assertNoInternalProbeFields(heartbeat.data);
    assertNoInternalProbeFields(leased.data);
    for (const value of [submitted.data, taskList.data, taskDetail.data, connectors.data, authStatus.data, audit.data]) {
      assertNoInternalProbeFields(value, [leaseId]);
    }

    const cookie = await login(server.baseUrl);
    const pages = await Promise.all([
      requestHtml(server.baseUrl, "/dashboard", cookie),
      requestHtml(server.baseUrl, "/dashboard/connectors", cookie),
      requestHtml(server.baseUrl, `/dashboard/tasks/${task.id}`, cookie),
      requestHtml(server.baseUrl, `/dashboard/audit?taskId=${task.id}`, cookie)
    ]);
    for (const page of pages) {
      assert.equal(page.response.status, 200);
      assertNoInternalProbeFields(page.html, [leaseId]);
    }
  });
});

describe("connector probe evidence persistence and expiry", () => {
  it("expires at the exact server boundary and never reuses another process session", () => {
    const now = Date.parse("2026-07-13T04:00:00.000Z");
    const heartbeat = {
      ...githubHeartbeat(),
      trusted: true,
      revision: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lastSeenAt: "2026-07-13T03:59:30.000Z",
      expiresAt: "2026-07-13T04:01:00.000Z"
    };
    const baseEvidence = {
      schemaVersion: "1",
      executorId: EXECUTOR_ID,
      executorSessionId: EXECUTOR_SESSION_ID,
      platform: "github",
      operation: "check_auth",
      capability: "check_auth",
      outcome: "verified",
      issueCode: "",
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      attemptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      heartbeatRevision: heartbeat.revision,
      checkedAt: "2026-07-13T03:45:00.000Z",
      expiresAt: "2026-07-13T04:00:00.000Z"
    };

    const expired = describeConnectorRuntime({
      registry: createConnectorRegistry(),
      heartbeats: [heartbeat],
      probes: [baseEvidence],
      now
    });
    assert.equal(runtimeGithub(expired).probe.status, "stale");
    assert.equal(runtimeGithub(expired).canRunReal, false);

    const fresh = describeConnectorRuntime({
      registry: createConnectorRegistry(),
      heartbeats: [heartbeat],
      probes: [{ ...baseEvidence, expiresAt: "2026-07-13T04:00:00.001Z" }],
      now
    });
    assert.equal(runtimeGithub(fresh).probe.status, "verified");
    assert.deepEqual(runtimeGithub(fresh).verifiedOperations, ["check_auth"]);

    const restarted = describeConnectorRuntime({
      registry: createConnectorRegistry(),
      heartbeats: [{ ...heartbeat, executorSessionId: WRONG_SESSION_ID }],
      probes: [{ ...baseEvidence, expiresAt: "2026-07-13T04:00:00.001Z" }],
      now
    });
    assert.equal(runtimeGithub(restarted).probe.status, "not_run");
    assert.equal(runtimeGithub(restarted).canRunReal, false);
  });

  it("keeps Postgres probe settlement conditional, atomic, and latest-only", async () => {
    const source = await readFile(new URL("../src/storage/postgresStore.js", import.meta.url), "utf8");
    assert.match(source, /CREATE TABLE IF NOT EXISTS connector_probe_evidence/);
    assert.match(source, /lease_executor_session_id/);
    assert.match(source, /AND lease_id = \$8/);
    assert.match(source, /AND lease_expires_at > now\(\)/);
    assert.match(source, /connector_probe_evidence\.checked_at <= EXCLUDED\.checked_at/);
    assert.match(source, /connector\.probe_recorded/);
  });
});

async function startTestServer() {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_LINK_APP_PASSWORD: "test-probe-password",
    AI_LINK_SESSION_SECRET: "probe-test-session-secret",
    AI_LINK_ADMIN_TOKEN: ADMIN_TOKEN,
    AI_LINK_EXECUTOR_TOKEN: EXECUTOR_TOKEN,
    AI_LINK_EXECUTOR_ID: EXECUTOR_ID,
    AI_LINK_CODEX_TOKEN: CODEX_TOKEN,
    AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS: "600000",
    AI_LINK_CONNECTOR_PROBE_TTL_MS: "60000"
  });
  const store = new MemoryStore();
  const { app } = await createApp({
    config,
    store,
    notifier: { approvalRequested: async () => {} }
  });
  const httpServer = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  return {
    store,
    baseUrl: `http://127.0.0.1:${httpServer.address().port}`,
    close: async () => {
      await new Promise((resolve) => httpServer.close(resolve));
      await store.close();
    }
  };
}

async function addUnboundExecutorToken(store) {
  await store.upsertApiToken({
    name: "unbound-probe-executor",
    tokenHash: hashToken(UNBOUND_EXECUTOR_TOKEN),
    scopes: ["executor:heartbeat", "executor:lease", "executor:result"],
    executorId: ""
  });
}

function githubHeartbeat({
  executorId = EXECUTOR_ID,
  executorSessionId = EXECUTOR_SESSION_ID,
  mode = "private"
} = {}) {
  return {
    schemaVersion: "1",
    executorId,
    ...(executorSessionId ? { executorSessionId } : {}),
    connectors: [{
      platform: "github",
      status: "available",
      mode,
      capabilities: [{
        name: "check_auth",
        available: true,
        mode: mode === "private" ? "live-read-only" : "mock"
      }],
      issues: []
    }]
  };
}

function githubResult({
  status,
  issueCode = "",
  checkedAt = new Date().toISOString(),
  includePrivateMarkers = false
}) {
  return {
    schema_version: "1",
    platform: "github",
    operation: "check_auth",
    status,
    session: {
      state: status === "ready" ? "valid" : (status === "blocked" ? "blocked" : "missing"),
      checked_at: checkedAt,
      ...(includePrivateMarkers ? { token: TOKEN_MARKER } : {})
    },
    items: [],
    action_required: status === "ready" ? null : {
      code: issueCode,
      action: "private-action-must-not-be-trusted",
      retryable: false
    },
    diagnostics: {
      item_count: 0,
      ...(includePrivateMarkers ? { raw_response: RAW_MARKER } : {})
    },
    ...(includePrivateMarkers ? {
      token: TOKEN_MARKER,
      raw_response: RAW_MARKER
    } : {})
  };
}

async function createProbeTask(server, { token = ADMIN_TOKEN, expectedStatus = 201 } = {}) {
  const created = await requestJson(server.baseUrl, "/api/tasks", {
    token,
    method: "POST",
    body: {
      workflow: "platform_auth_collect",
      input: {
        platform: "github",
        operation: "check_auth",
        owner: "xiaoqi-AI",
        repo: "ai_Link",
        scope: "repo_read"
      },
      options: { evidenceIntent: "connector_probe" }
    }
  });
  assert.equal(created.response.status, expectedStatus);
  if (expectedStatus !== 201) return created.data;
  assert.equal(created.data.task.status, "queued");
  return created.data.task;
}

async function reportHeartbeat(server, { token, heartbeat }) {
  return requestJson(server.baseUrl, "/api/executor/heartbeat", {
    token,
    method: "POST",
    body: heartbeat
  });
}

async function leaseProbe(server, {
  token = EXECUTOR_TOKEN,
  executorId = EXECUTOR_ID,
  executorSessionId = EXECUTOR_SESSION_ID,
  includeSession = true
} = {}) {
  return requestJson(server.baseUrl, "/api/executor/lease", {
    token,
    method: "POST",
    body: {
      executorId,
      ...(includeSession ? { executorSessionId } : {})
    }
  });
}

async function submitProbeResult(server, taskId, {
  leaseId,
  status,
  result,
  executorSessionId = EXECUTOR_SESSION_ID,
  includeSession = true
}) {
  return requestJson(server.baseUrl, `/api/executor/tasks/${taskId}/result`, {
    token: EXECUTOR_TOKEN,
    method: "POST",
    body: {
      status,
      executorId: EXECUTOR_ID,
      ...(includeSession ? { executorSessionId } : {}),
      leaseId,
      result
    }
  });
}

async function runTrustedProbe(server, { status, result }) {
  const task = await createProbeTask(server);
  const leased = await leaseProbe(server);
  assert.equal(leased.data.task.id, task.id);
  const reported = await submitProbeResult(server, task.id, {
    leaseId: leased.data.task.leaseId,
    status,
    result
  });
  assert.equal(reported.response.status, 200);
  return { taskId: task.id, response: reported };
}

async function githubAuthItem(server) {
  const status = await requestJson(server.baseUrl, "/api/auth-status", { token: CODEX_TOKEN });
  assert.equal(status.response.status, 200);
  return status.data.authStatus.items.find((item) => item.platform === "github");
}

function runtimeGithub(value) {
  return value.executorRuntime.connectors.find((item) => item.platform === "github");
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "test-probe-password", next: "/dashboard" }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function requestHtml(baseUrl, path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
  return { response, html: await response.text() };
}

async function requestJson(baseUrl, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function assertNoInternalProbeFields(value, additionalMarkers = []) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    "attemptId",
    "heartbeatRevision",
    "leaseHeartbeatRevision",
    "executorSessionId",
    "leaseExecutorSessionId",
    EXECUTOR_SESSION_ID,
    TOKEN_MARKER,
    RAW_MARKER,
    ...additionalMarkers
  ];
  for (const marker of forbidden) {
    assert.equal(serialized.includes(marker), false, `public surface leaked ${marker}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
