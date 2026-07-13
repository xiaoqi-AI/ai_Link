import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { APPROVAL_STATUSES, TASK_STATUSES } from "../src/domain/workflow.js";
import { MemoryStore } from "../src/storage/memoryStore.js";
import { PostgresStore } from "../src/storage/postgresStore.js";
import { normalizeRetentionPolicy } from "../src/storage/retention.js";

const AS_OF = "2026-07-13T05:00:00.000Z";
const OLD = "2025-01-01T00:00:00.000Z";
const RECENT = "2026-07-12T00:00:00.000Z";

describe("Auth Hub retention lifecycle", () => {
  it("previews bounded MemoryStore candidates without changing protected data", async () => {
    const store = retentionFixture();
    const before = memorySnapshot(store);

    const report = await store.runRetentionMaintenance({
      now: AS_OF,
      policy: { maxRowsPerTable: 1 }
    });

    assert.equal(report.mode, "dry-run");
    assert.deepEqual(report.changed, emptyCounts());
    assert.deepEqual(report.candidates, {
      approvals: 1,
      artifacts: 1,
      executorHeartbeats: 1,
      connectorProbes: 1,
      auditEvents: 1
    });
    assert.equal(report.hasMore, true);
    assert.deepEqual(memorySnapshot(store), before);
    assert.deepEqual(report.protectedResources, ["tasks", "apiTokens", "platformAccounts", "privateLoginState"]);
  });

  it("requires backup confirmation before MemoryStore apply", async () => {
    const store = retentionFixture();
    const before = memorySnapshot(store);

    await assert.rejects(
      store.runRetentionMaintenance({ apply: true, now: AS_OF }),
      /backup or PITR confirmation/
    );
    assert.deepEqual(memorySnapshot(store), before);
  });

  it("expires approvals and deletes only eligible MemoryStore records", async () => {
    const store = retentionFixture();
    const report = await store.runRetentionMaintenance({
      apply: true,
      backupConfirmed: true,
      actor: "maintenance:test",
      now: AS_OF,
      policy: { maxRowsPerTable: 10 }
    });

    assert.equal(report.mode, "apply");
    assert.equal(report.changed.approvals, 1);
    assert.equal(store.approvals.get("approval-expired").status, APPROVAL_STATUSES.EXPIRED);
    assert.equal(store.tasks.get("task-approval").status, TASK_STATUSES.ACTION_REQUIRED);
    assert.deepEqual(store.tasks.get("task-approval").error, { code: "approval_expired" });
    assert.equal(store.tasks.has("task-terminal"), true);
    assert.equal(store.tasks.has("task-active"), true);
    assert.equal(store.artifacts.has("artifact-terminal-old"), false);
    assert.equal(store.artifacts.has("artifact-terminal-recent"), true);
    assert.equal(store.artifacts.has("artifact-active-old"), true);
    assert.equal(store.apiTokens.has("manual-hash"), true);
    assert.ok(store.auditEvents.some((record) => record.eventType === "maintenance.retention_applied"));
  });

  it("assigns new approvals an expiry and rejects late decisions", async () => {
    const store = new MemoryStore({ retention: { approvalDays: 3 } });
    const task = await store.createTask({
      workflow: "full_chain",
      input: { title: "approval" },
      targets: ["mock"],
      options: {},
      createdBy: "test"
    });
    store.tasks.get(task.id).status = TASK_STATUSES.APPROVAL_REQUIRED;
    const approval = await store.createApproval({
      taskId: task.id,
      type: "publish",
      title: "Confirm",
      summary: "",
      nextStep: "publish",
      requestedBy: "test",
      expiresAt: "2000-01-01T00:00:00.000Z"
    });
    assert.notEqual(approval.expiresAt, "2000-01-01T00:00:00.000Z");
    store.approvals.get(approval.id).expiresAt = "2000-01-01T00:00:00.000Z";

    const decision = await store.decideApproval({
      taskId: task.id,
      approvalId: approval.id,
      approved: true,
      actor: "test",
      note: "late"
    });

    assert.equal(decision.changed, false);
    assert.equal(decision.reason, "approval_expired");
    assert.equal(decision.approval.status, APPROVAL_STATUSES.EXPIRED);
    assert.equal(decision.task.status, TASK_STATUSES.ACTION_REQUIRED);
  });

  it("expires late approvals without reopening terminal tasks", async () => {
    for (const status of [TASK_STATUSES.COMPLETED, TASK_STATUSES.CANCELLED]) {
      const store = new MemoryStore();
      const taskRecord = await store.createTask({
        workflow: "full_chain",
        input: { title: status },
        targets: ["mock"],
        options: {},
        createdBy: "test"
      });
      store.tasks.get(taskRecord.id).status = status;
      const approval = await store.createApproval({
        taskId: taskRecord.id,
        type: "publish",
        title: "Confirm",
        summary: "",
        nextStep: "publish",
        requestedBy: "test"
      });
      store.approvals.get(approval.id).expiresAt = "2000-01-01T00:00:00.000Z";

      const decision = await store.decideApproval({
        taskId: taskRecord.id,
        approvalId: approval.id,
        approved: true,
        actor: "test",
        note: "late"
      });

      assert.equal(decision.reason, "approval_expired");
      assert.equal(decision.task.status, status);
    }
  });

  it("rejects current approvals whose task context is already terminal", async () => {
    for (const status of [TASK_STATUSES.COMPLETED, TASK_STATUSES.CANCELLED]) {
      const store = new MemoryStore();
      const taskRecord = await store.createTask({
        workflow: "full_chain",
        input: { title: status },
        targets: ["mock"],
        options: {},
        createdBy: "test"
      });
      store.tasks.get(taskRecord.id).status = status;
      const approval = await store.createApproval({
        taskId: taskRecord.id,
        type: "publish",
        title: "Confirm",
        summary: "",
        nextStep: "publish",
        requestedBy: "test"
      });

      const decision = await store.decideApproval({
        taskId: taskRecord.id,
        approvalId: approval.id,
        approved: true,
        actor: "test",
        note: "stale"
      });

      assert.equal(decision.reason, "approval_context_stale");
      assert.equal(decision.task.status, status);
      assert.equal(decision.approval.status, APPROVAL_STATUSES.PENDING);
    }
  });

  it("bounds unsafe retention configuration", () => {
    assert.deepEqual(normalizeRetentionPolicy({
      artifactDays: -1,
      approvalDays: 999,
      auditDays: 1,
      maintenanceAuditDays: 99999,
      heartbeatGraceHours: 0,
      probeGraceDays: Number.NaN,
      maxRowsPerTable: 50000
    }), {
      artifactDays: 1,
      approvalDays: 90,
      auditDays: 30,
      maintenanceAuditDays: 3650,
      heartbeatGraceHours: 1,
      probeGraceDays: 7,
      maxRowsPerTable: 1000
    });
    assert.equal(normalizeRetentionPolicy({ auditDays: 400, maintenanceAuditDays: 90 }).maintenanceAuditDays, 400);
  });

  it("uses a read-only Postgres transaction for dry-run", async () => {
    const queries = [];
    const client = retentionClient(queries);
    const store = Object.create(PostgresStore.prototype);
    store.retentionPolicy = normalizeRetentionPolicy();
    store.pool = { connect: async () => client };

    const report = await store.runRetentionMaintenance({ now: AS_OF });

    assert.equal(report.mode, "dry-run");
    assert.match(queries[0].text, /READ ONLY/);
    assert.equal(queries.some((query) => /DELETE|UPDATE|INSERT/.test(query.text)), false);
    assert.equal(queries.at(-1).text, "ROLLBACK");
    assert.equal(client.released, true);
  });

  it("lets the Postgres clock own new approval expiry", async () => {
    const queries = [];
    const store = Object.create(PostgresStore.prototype);
    store.retentionPolicy = normalizeRetentionPolicy({ approvalDays: 5 });
    store.pool = {
      async query(text, params) {
        queries.push({ text, params });
        return { rows: [{
          id: "00000000-0000-4000-8000-000000000020",
          task_id: "00000000-0000-4000-8000-000000000021",
          type: "publish",
          title: "Confirm",
          summary: "",
          next_step: "publish",
          status: "pending",
          requested_by: "test",
          created_at: new Date(AS_OF),
          expires_at: new Date("2026-07-18T05:00:00.000Z")
        }] };
      }
    };

    await store.createApproval({
      taskId: "00000000-0000-4000-8000-000000000021",
      type: "publish",
      title: "Confirm",
      summary: "",
      nextStep: "publish",
      requestedBy: "test"
    });

    assert.match(queries[0].text, /now\(\) \+ \(\$8::int \* interval '1 day'\)/);
    assert.equal(queries[0].params[7], 5);
  });

  it("rolls back the complete Postgres apply batch on a later delete failure", async () => {
    const queries = [];
    const client = retentionClient(queries, { artifactFailure: true });
    const store = Object.create(PostgresStore.prototype);
    store.retentionPolicy = normalizeRetentionPolicy();
    store.pool = { connect: async () => client };

    await assert.rejects(
      store.runRetentionMaintenance({
        apply: true,
        backupConfirmed: true,
        actor: "maintenance:test",
        now: AS_OF
      }),
      /forced artifact delete failure/
    );
    assert.equal(queries.some((query) => query.text === "COMMIT"), false);
    assert.equal(queries.at(-1).text, "ROLLBACK");
    assert.equal(client.released, true);
  });

  it("keeps the maintenance CLI fail-closed without a database or backup confirmation", () => {
    const noDatabase = runCli(["--json"]);
    assert.equal(noDatabase.status, 1);
    assert.match(noDatabase.stderr, /DATABASE_URL is required/);

    const noBackup = runCli(["--apply"]);
    assert.equal(noBackup.status, 1);
    assert.match(noBackup.stderr, /requires --confirm-backup/);
  });

  it("rejects destructive Postgres test URLs with host override parameters", () => {
    const result = spawnSync(process.execPath, ["tests/postgres-store.integration.test.js"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_DATABASE_URL: "postgresql://ai_link_test:ai_link_test@127.0.0.1/ai_link_test?host=outside.invalid",
        AI_LINK_ALLOW_DESTRUCTIVE_DB_TESTS: "1"
      }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refuses connection-string query parameters/);
  });
});

function retentionFixture() {
  const store = new MemoryStore();
  store.tasks.set("task-terminal", task("task-terminal", TASK_STATUSES.COMPLETED, OLD));
  store.tasks.set("task-active", task("task-active", TASK_STATUSES.RUNNING, OLD));
  store.tasks.set("task-approval", task("task-approval", TASK_STATUSES.APPROVAL_REQUIRED, OLD));
  store.approvals.set("approval-expired", {
    id: "approval-expired",
    taskId: "task-approval",
    status: APPROVAL_STATUSES.PENDING,
    createdAt: OLD,
    expiresAt: OLD
  });
  store.approvals.set("approval-recent", {
    id: "approval-recent",
    taskId: "task-active",
    status: APPROVAL_STATUSES.PENDING,
    createdAt: RECENT,
    expiresAt: "2026-07-20T00:00:00.000Z"
  });
  store.artifacts.set("artifact-terminal-old", artifact("artifact-terminal-old", "task-terminal", OLD));
  store.artifacts.set("artifact-terminal-old-2", artifact("artifact-terminal-old-2", "task-terminal", OLD));
  store.artifacts.set("artifact-terminal-recent", artifact("artifact-terminal-recent", "task-terminal", RECENT));
  store.artifacts.set("artifact-active-old", artifact("artifact-active-old", "task-active", OLD));
  store.executorHeartbeats.set("executor-old", { executorId: "executor-old", expiresAt: OLD });
  store.connectorProbeEvidence.set("executor-old:github:check_auth", {
    executorId: "executor-old",
    platform: "github",
    operation: "check_auth",
    expiresAt: OLD
  });
  store.auditEvents.push(
    { id: "audit-terminal-old", taskId: "task-terminal", eventType: "task.completed", createdAt: OLD },
    { id: "audit-terminal-old-2", taskId: "task-terminal", eventType: "task.completed", createdAt: OLD },
    { id: "audit-active-old", taskId: "task-active", eventType: "task.leased", createdAt: OLD }
  );
  store.apiTokens.set("manual-hash", { name: "manual", tokenHash: "manual-hash", revokedAt: null });
  return store;
}

function task(id, status, updatedAt) {
  return { id, status, updatedAt, error: null };
}

function artifact(id, taskId, createdAt) {
  return { id, taskId, createdAt, retentionUntil: null };
}

function emptyCounts() {
  return { approvals: 0, artifacts: 0, executorHeartbeats: 0, connectorProbes: 0, auditEvents: 0 };
}

function memorySnapshot(store) {
  return JSON.parse(JSON.stringify({
    tasks: [...store.tasks.entries()],
    approvals: [...store.approvals.entries()],
    artifacts: [...store.artifacts.entries()],
    auditEvents: store.auditEvents,
    apiTokens: [...store.apiTokens.entries()],
    executorHeartbeats: [...store.executorHeartbeats.entries()],
    connectorProbeEvidence: [...store.connectorProbeEvidence.entries()]
  }));
}

function retentionClient(queries, { artifactFailure = false } = {}) {
  return {
    released: false,
    async query(text, params = []) {
      queries.push({ text, params });
      if (text.includes("pg_try_advisory_xact_lock")) return { rows: [{ locked: true }], rowCount: 1 };
      if (text.includes("transaction_timestamp")) return { rows: [{ as_of: new Date(AS_OF) }], rowCount: 1 };
      if (text.includes("FROM approvals target")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM artifacts target")) {
        return { rows: artifactFailure ? [{ id: "00000000-0000-4000-8000-000000000010" }] : [], rowCount: 0 };
      }
      if (text.includes("FROM executor_heartbeats target")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM connector_probe_evidence target")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM audit_events target")) return { rows: [], rowCount: 0 };
      if (artifactFailure && text.startsWith("DELETE FROM artifacts")) {
        throw new Error("forced artifact delete failure");
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      this.released = true;
    }
  };
}

function runCli(args) {
  return spawnSync(process.execPath, ["tools/run-auth-hub-retention.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: "" }
  });
}
