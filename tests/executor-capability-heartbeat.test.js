import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  buildExecutorCapabilityHeartbeat,
  describeConnectorRuntime,
  normalizeExecutorCapabilityHeartbeat
} from "../src/connectors/executorCapabilities.js";
import { summarizeConnectorAuthStatus } from "../src/connectors/authStatus.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import { runExecutorOnce } from "../src/executor/localExecutor.js";
import { MemoryStore } from "../src/storage/memoryStore.js";

const PRIVATE_MARKERS = [
  "private-cookie-value",
  "test-private-token-value",
  "runtime/private",
  "browser-profile-value",
  "raw-response-value"
];

describe("executor capability heartbeat", () => {
  let server;
  let baseUrl;

  before(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      AI_LINK_APP_PASSWORD: "test-password",
      AI_LINK_SESSION_SECRET: "test-session-secret",
      AI_LINK_ADMIN_TOKEN: "admin-token",
      AI_LINK_EXECUTOR_TOKEN: "executor-token",
      AI_LINK_CODEX_TOKEN: "codex-token",
      AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS: "15000"
    });
    const { app } = await createApp({
      config,
      store: new MemoryStore(),
      notifier: { approvalRequested: async () => {} }
    });
    server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("builds a strict capability-only snapshot and preserves capability modes", () => {
    const heartbeat = buildExecutorCapabilityHeartbeat({
      executorId: "local-executor",
      registry: privateRegistry()
    });
    const xiaohongshu = heartbeat.connectors.find((item) => item.platform === "xiaohongshu");

    assert.equal(heartbeat.schemaVersion, "1");
    assert.equal(xiaohongshu.status, "available");
    assert.equal(xiaohongshu.mode, "private");
    assert.equal(
      xiaohongshu.capabilities.find((item) => item.name === "check_session").mode,
      "live-read-only"
    );
    assert.deepEqual(Object.keys(heartbeat).sort(), ["connectors", "executorId", "schemaVersion"]);
    assertNoPrivateMarkers(heartbeat);
  });

  it("rejects unknown fields, invalid executor ids, and contradictory capability claims", () => {
    const heartbeat = buildExecutorCapabilityHeartbeat({
      executorId: "local-executor",
      registry: privateRegistry()
    });

    assert.equal(
      normalizeExecutorCapabilityHeartbeat({ ...heartbeat, cookie: "private-cookie-value" }).reason,
      "invalid_envelope"
    );
    assert.equal(
      normalizeExecutorCapabilityHeartbeat({ ...heartbeat, executorId: "unsafe machine name" }).reason,
      "invalid_executor_id"
    );

    const contradictory = structuredClone(heartbeat);
    const xiaohongshu = contradictory.connectors.find((item) => item.platform === "xiaohongshu");
    xiaohongshu.capabilities.find((item) => item.name === "check_session").available = false;
    assert.equal(
      normalizeExecutorCapabilityHeartbeat(contradictory).reason,
      "invalid_connector_snapshot"
    );
  });

  it("keeps the static contract separate from fresh and stale executor evidence", () => {
    const heartbeat = buildExecutorCapabilityHeartbeat({
      executorId: "local-executor",
      registry: privateRegistry()
    });
    const fresh = describeConnectorRuntime({
      registry: createConnectorRegistry(),
      now: Date.parse("2026-07-12T12:00:30.000Z"),
      heartbeats: [{
        ...heartbeat,
        actor: "executor",
        lastSeenAt: "2026-07-12T12:00:00.000Z",
        expiresAt: "2026-07-12T12:01:00.000Z"
      }]
    });

    assert.equal(fresh.connectors.find((item) => item.platform === "xiaohongshu").status, "reserved");
    const runtimeXhs = fresh.executorRuntime.connectors.find((item) => item.platform === "xiaohongshu");
    assert.equal(runtimeXhs.status, "available");
    assert.equal(runtimeXhs.source, "executor");
    assert.equal(runtimeXhs.runtime.status, "online");
    assert.equal(runtimeXhs.operationalStatus, "unverified");
    assert.equal(runtimeXhs.canRunReal, false);

    const stale = describeConnectorRuntime({
      registry: createConnectorRegistry(),
      now: Date.parse("2026-07-12T12:02:00.000Z"),
      heartbeats: [{
        ...heartbeat,
        actor: "executor",
        lastSeenAt: "2026-07-12T12:00:00.000Z",
        expiresAt: "2026-07-12T12:01:00.000Z"
      }]
    });
    const staleXhs = stale.executorRuntime.connectors.find((item) => item.platform === "xiaohongshu");
    assert.equal(staleXhs.source, "server_registry");
    assert.equal(staleXhs.status, "reserved");
    assert.equal(staleXhs.runtime.status, "stale");
    assert.equal(stale.executorRuntime.summary.stale, 1);
  });

  it("fails closed when executor evidence is missing or stale", () => {
    const missingRuntime = describeConnectorRuntime({
      registry: privateRegistry(),
      now: Date.parse("2026-07-12T12:00:30.000Z"),
      heartbeats: []
    });
    const missingStatus = summarizeConnectorAuthStatus({
      connectors: missingRuntime.executorRuntime.connectors
    });
    const missingXhs = missingStatus.items.find((item) => item.platform === "xiaohongshu");
    assert.equal(missingXhs.status, "unverified");
    assert.equal(missingXhs.reason, "executor_heartbeat_missing");
    assert.equal(missingXhs.canRunReal, false);

    const heartbeat = buildExecutorCapabilityHeartbeat({
      executorId: "local-executor",
      registry: privateRegistry()
    });
    const staleRuntime = describeConnectorRuntime({
      registry: createConnectorRegistry(),
      now: Date.parse("2026-07-12T12:02:00.000Z"),
      heartbeats: [{
        ...heartbeat,
        actor: "executor",
        lastSeenAt: "2026-07-12T12:00:00.000Z",
        expiresAt: "2026-07-12T12:01:00.000Z"
      }]
    });
    const staleStatus = summarizeConnectorAuthStatus({
      connectors: staleRuntime.executorRuntime.connectors
    });
    const staleXhs = staleStatus.items.find((item) => item.platform === "xiaohongshu");
    assert.equal(staleXhs.connectorStatus, "reserved");
    assert.equal(staleXhs.status, "unverified");
    assert.equal(staleXhs.reason, "executor_heartbeat_stale");
    assert.equal(staleXhs.canRunReal, false);
  });

  it("lets the real local executor report a snapshot without exposing private state", async () => {
    const result = await runExecutorOnce({
      baseUrl,
      token: "executor-token",
      executorId: "local-executor",
      registry: privateRegistry()
    });
    assert.deepEqual(result, { leased: false });

    const status = await requestJson(baseUrl, "/api/connectors", { token: "codex-token" });
    assert.equal(status.response.status, 200);
    assert.equal(status.data.executorRuntime.summary.online, 1);
    assert.equal(status.data.executorRuntime.executors[0].executorId, "local-executor");
    const runtimeXhs = status.data.executorRuntime.connectors.find((item) => item.platform === "xiaohongshu");
    assert.equal(runtimeXhs.source, "executor");
    assert.equal(runtimeXhs.mode, "private");
    assert.equal(runtimeXhs.canRunReal, false);
    assertNoPrivateMarkers(status.data);

    const authStatus = await requestJson(baseUrl, "/api/auth-status", { token: "codex-token" });
    const xiaohongshu = authStatus.data.authStatus.items.find((item) => item.platform === "xiaohongshu");
    assert.equal(xiaohongshu.status, "unverified");
    assert.equal(xiaohongshu.reason, "probe_not_run");
    assert.equal(xiaohongshu.runtimeStatus, "online");
    assert.equal(xiaohongshu.canRunReal, false);
  });

  it("keeps heartbeat reporting best-effort when an older Hub has no endpoint", async () => {
    const paths = [];
    const legacy = http.createServer((req, res) => {
      paths.push(req.url);
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/executor/heartbeat") {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      res.end(JSON.stringify({ task: null }));
    });
    await new Promise((resolve) => legacy.listen(0, "127.0.0.1", resolve));
    try {
      const result = await runExecutorOnce({
        baseUrl: `http://127.0.0.1:${legacy.address().port}`,
        token: "executor-token",
        executorId: "local-executor",
        registry: privateRegistry()
      });
      assert.deepEqual(result, { leased: false });
      assert.deepEqual(paths, ["/api/executor/heartbeat", "/api/executor/lease"]);
    } finally {
      await new Promise((resolve) => legacy.close(resolve));
    }
  });

  it("requires the heartbeat scope and persists only the latest Postgres snapshot", async () => {
    const unsafe = await requestJson(baseUrl, "/api/executor/heartbeat", {
      token: "executor-token",
      method: "POST",
      body: {
        ...buildExecutorCapabilityHeartbeat({ executorId: "unsafe-executor", registry: privateRegistry() }),
        cookie: "private-cookie-value"
      }
    });
    assert.equal(unsafe.response.status, 400);
    assert.equal(unsafe.data.error, "invalid_executor_heartbeat");

    const denied = await requestJson(baseUrl, "/api/executor/heartbeat", {
      token: "codex-token",
      method: "POST",
      body: buildExecutorCapabilityHeartbeat({ executorId: "local-executor", registry: privateRegistry() })
    });
    assert.equal(denied.response.status, 403);

    const source = await readFile(new URL("../src/storage/postgresStore.js", import.meta.url), "utf8");
    assert.match(source, /CREATE TABLE IF NOT EXISTS executor_heartbeats/);
    assert.match(source, /executor_id text PRIMARY KEY/);
    assert.match(source, /ON CONFLICT \(executor_id\) DO UPDATE/);
    assert.equal(/hostname|module_path|browser_profile|raw_response/i.test(source), false);
  });
});

function privateRegistry() {
  return createConnectorRegistry({
    privateConnectors: {
      xiaohongshu: {
        mode: "private",
        capabilityModes: {
          check_session: "live-read-only",
          begin_login: "approval-required-local",
          read_content: "live-read-only"
        },
        checkSession: async () => ({
          cookie: "private-cookie-value",
          profile: "browser-profile-value"
        }),
        beginLogin: async () => ({ token: "test-private-token-value" }),
        readContent: async () => ({ raw_response: "raw-response-value" })
      }
    }
  });
}

async function requestJson(baseUrl, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function assertNoPrivateMarkers(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PRIVATE_MARKERS) {
    assert.equal(serialized.includes(marker.toLowerCase()), false, `unexpected private marker: ${marker}`);
  }
}
