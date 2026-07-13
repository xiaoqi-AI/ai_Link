import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { hashToken } from "../src/security/auth.js";
import { PostgresStore } from "../src/storage/postgresStore.js";

const TEST_DATABASE_URL = String(process.env.TEST_DATABASE_URL || "").trim();
const DESTRUCTIVE_TESTS_ALLOWED = process.env.AI_LINK_ALLOW_DESTRUCTIVE_DB_TESTS === "1";
const integrationRequested = Boolean(TEST_DATABASE_URL || DESTRUCTIVE_TESTS_ALLOWED);
const integrationEnabled = Boolean(TEST_DATABASE_URL && DESTRUCTIVE_TESTS_ALLOWED);

if (integrationRequested) validateTestDatabase(TEST_DATABASE_URL, DESTRUCTIVE_TESTS_ALLOWED);

const postgresDescribe = integrationEnabled ? describe : describe.skip;

postgresDescribe("PostgresStore lifecycle integration", () => {
  let store;

  before(async () => {
    store = new PostgresStore({ connectionString: TEST_DATABASE_URL });
    await store.init();
  });

  beforeEach(async () => {
    await cleanDatabase(store);
  });

  after(async () => {
    if (!store) return;
    await cleanDatabase(store);
    await store.close();
  });

  it("rotates configured tokens and never revives the same revoked hash", async () => {
    const oldHash = hashToken("integration-old-token-value");
    const newHash = hashToken("integration-new-token-value");
    await store.syncConfiguredApiTokens(tokenSnapshot([{ name: "codex", tokenHash: oldHash }]));
    await store.syncConfiguredApiTokens(tokenSnapshot([{ name: "codex", tokenHash: newHash }]));

    assert.equal(await store.findApiTokenByHash(oldHash), null);
    assert.equal((await store.findApiTokenByHash(newHash)).revokedAt, null);

    await store.pool.query(
      "UPDATE api_tokens SET revoked_at = now(), expires_at = now() - interval '1 minute' WHERE token_hash = $1",
      [newHash]
    );
    await store.syncConfiguredApiTokens(tokenSnapshot([{ name: "codex", tokenHash: newHash }]));
    const preserved = await store.findApiTokenByHash(newHash);
    assert.ok(preserved.revokedAt);
    assert.ok(preserved.expiresAt);

    const removed = await store.syncConfiguredApiTokens(tokenSnapshot([]));
    assert.equal(removed.revoked, 0);
  });

  it("settles an executor lease once under concurrent result submissions", async () => {
    const created = await store.createTask({
      workflow: "read_detect",
      input: { text: "postgres lease test" },
      targets: ["wechat_official"],
      options: {},
      createdBy: "integration"
    });
    const leased = await store.leaseTask({
      executorId: "integration-executor",
      executorSessionId: "integration-session",
      leaseMs: 60_000
    });
    assert.equal(leased.id, created.id);

    const settlement = {
      taskId: created.id,
      executorId: "integration-executor",
      executorSessionId: "integration-session",
      leaseId: leased.leaseId,
      taskStatus: "completed",
      resultStatus: "completed",
      summary: "settled once",
      result: { output: "ok" },
      artifacts: [{ kind: "summary", title: "result" }],
      actor: "integration-executor"
    };
    const outcomes = await Promise.all([
      store.settleTaskResult(settlement),
      store.settleTaskResult(settlement)
    ]);

    assert.equal(outcomes.filter(Boolean).length, 1);
    assert.equal((await store.getTask(created.id)).status, "completed");
    assert.equal((await store.listArtifacts(created.id)).length, 1);
    const audits = await store.listAuditEvents({ taskId: created.id, eventType: "task.completed" });
    assert.equal(audits.length, 1);
  });

  it("rolls back a task settlement when a dependent write fails", async () => {
    const created = await store.createTask({
      workflow: "read_detect",
      input: { text: "postgres rollback test" },
      targets: ["wechat_official"],
      options: {},
      createdBy: "integration"
    });
    const leased = await store.leaseTask({
      executorId: "rollback-executor",
      executorSessionId: "rollback-session",
      leaseMs: 60_000
    });
    await store.pool.query(`
      CREATE OR REPLACE FUNCTION ai_link_test_reject_artifact_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced settlement rollback';
      END;
      $$;
      CREATE TRIGGER ai_link_test_artifact_insert
      BEFORE INSERT ON artifacts
      FOR EACH ROW EXECUTE FUNCTION ai_link_test_reject_artifact_insert();
    `);
    try {
      await assert.rejects(
        store.settleTaskResult({
          taskId: created.id,
          executorId: "rollback-executor",
          executorSessionId: "rollback-session",
          leaseId: leased.leaseId,
          taskStatus: "completed",
          resultStatus: "completed",
          summary: "must roll back",
          result: { output: "not persisted" },
          artifacts: [{ kind: "summary", title: "blocked" }],
          actor: "rollback-executor"
        }),
        /forced settlement rollback/
      );
    } finally {
      await store.pool.query("DROP TRIGGER IF EXISTS ai_link_test_artifact_insert ON artifacts");
      await store.pool.query("DROP FUNCTION IF EXISTS ai_link_test_reject_artifact_insert() ");
    }

    const task = await store.getTask(created.id);
    assert.equal(task.status, "running");
    assert.equal(task.leaseId, leased.leaseId);
    assert.equal((await store.listArtifacts(created.id)).length, 0);
    const audits = await store.listAuditEvents({ taskId: created.id, eventType: "task.completed" });
    assert.equal(audits.length, 0);
  });

  it("previews without writes and applies only eligible retention records", async () => {
    const fixture = await seedRetentionFixture(store);
    const beforeCounts = await tableCounts(store);
    const preview = await store.runRetentionMaintenance({ policy: retentionPolicy() });

    assert.equal(preview.mode, "dry-run");
    assert.equal(preview.candidates.approvals, 1);
    assert.equal(preview.candidates.artifacts, 1);
    assert.equal(preview.candidates.executorHeartbeats, 1);
    assert.equal(preview.candidates.connectorProbes, 1);
    assert.equal(preview.candidates.auditEvents, 1);
    assert.deepEqual(await tableCounts(store), beforeCounts);

    const report = await store.runRetentionMaintenance({
      apply: true,
      backupConfirmed: true,
      actor: "maintenance:integration",
      policy: retentionPolicy()
    });
    assert.equal(report.mode, "apply");
    assert.deepEqual(report.changed, {
      approvals: 1,
      artifacts: 1,
      executorHeartbeats: 1,
      connectorProbes: 1,
      auditEvents: 1
    });

    assert.equal(await exists(store, "tasks", fixture.terminalTaskId), true);
    assert.equal(await exists(store, "tasks", fixture.activeTaskId), true);
    assert.equal(await exists(store, "artifacts", fixture.expiredArtifactId), false);
    assert.equal(await exists(store, "artifacts", fixture.recentArtifactId), true);
    assert.equal(await exists(store, "artifacts", fixture.protectedArtifactId), true);
    const approval = await store.pool.query("SELECT status FROM approvals WHERE id = $1", [fixture.approvalId]);
    assert.equal(approval.rows[0].status, "expired");
    const approvalTask = await store.pool.query("SELECT status, error FROM tasks WHERE id = $1", [fixture.approvalTaskId]);
    assert.equal(approvalTask.rows[0].status, "action_required");
    assert.equal(approvalTask.rows[0].error.code, "approval_expired");
    const maintenance = await store.pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE event_type = 'maintenance.retention_applied'"
    );
    assert.equal(maintenance.rows[0].count, 1);
  });

  it("expires late approvals without reopening terminal tasks", async () => {
    for (const status of ["completed", "cancelled"]) {
      const taskId = crypto.randomUUID();
      const approvalId = crypto.randomUUID();
      await store.pool.query(
        `INSERT INTO tasks (
           id, workflow, status, current_step, input, targets, options, created_by
         ) VALUES ($1, 'full_chain', $2, 'publish', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'integration')`,
        [taskId, status]
      );
      await store.pool.query(
        `INSERT INTO approvals (
           id, task_id, type, title, summary, next_step, status, requested_by, expires_at
         ) VALUES ($1, $2, 'publish', 'Confirm', '', 'publish', 'pending', 'integration', now() - interval '1 day')`,
        [approvalId, taskId]
      );

      const decision = await store.decideApproval({
        taskId,
        approvalId,
        approved: true,
        actor: "integration",
        note: "late"
      });

      assert.equal(decision.reason, "approval_expired");
      assert.equal(decision.task.status, status);
    }
  });

  it("rejects current approvals whose task context is already terminal", async () => {
    for (const status of ["completed", "cancelled"]) {
      const taskId = crypto.randomUUID();
      const approvalId = crypto.randomUUID();
      await store.pool.query(
        `INSERT INTO tasks (
           id, workflow, status, current_step, input, targets, options, created_by
         ) VALUES ($1, 'full_chain', $2, 'publish', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'integration')`,
        [taskId, status]
      );
      await store.pool.query(
        `INSERT INTO approvals (
           id, task_id, type, title, summary, next_step, status, requested_by, expires_at
         ) VALUES ($1, $2, 'publish', 'Confirm', '', 'publish', 'pending', 'integration', now() + interval '1 day')`,
        [approvalId, taskId]
      );

      const decision = await store.decideApproval({
        taskId,
        approvalId,
        approved: true,
        actor: "integration",
        note: "stale"
      });

      assert.equal(decision.reason, "approval_context_stale");
      assert.equal(decision.task.status, status);
      assert.equal(decision.approval.status, "pending");
    }
  });

  it("rolls back earlier lifecycle changes when a later delete fails", async () => {
    const fixture = await seedRetentionFixture(store);
    await store.pool.query(`
      CREATE OR REPLACE FUNCTION ai_link_test_reject_artifact_delete()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced retention rollback';
      END;
      $$;
      CREATE TRIGGER ai_link_test_artifact_delete
      BEFORE DELETE ON artifacts
      FOR EACH ROW EXECUTE FUNCTION ai_link_test_reject_artifact_delete();
    `);
    try {
      await assert.rejects(
        store.runRetentionMaintenance({
          apply: true,
          backupConfirmed: true,
          actor: "maintenance:integration",
          policy: retentionPolicy()
        }),
        /forced retention rollback/
      );
    } finally {
      await store.pool.query("DROP TRIGGER IF EXISTS ai_link_test_artifact_delete ON artifacts");
      await store.pool.query("DROP FUNCTION IF EXISTS ai_link_test_reject_artifact_delete() ");
    }

    const approval = await store.pool.query("SELECT status FROM approvals WHERE id = $1", [fixture.approvalId]);
    assert.equal(approval.rows[0].status, "pending");
    const approvalTask = await store.pool.query("SELECT status FROM tasks WHERE id = $1", [fixture.approvalTaskId]);
    assert.equal(approvalTask.rows[0].status, "approval_required");
    assert.equal(await exists(store, "artifacts", fixture.expiredArtifactId), true);
    assert.equal(await existsByText(store, "executor_heartbeats", "executor_id", "integration-executor"), true);
  });
});

function validateTestDatabase(connectionString, allowed) {
  if (!connectionString || !allowed) {
    throw new Error("Postgres integration requires TEST_DATABASE_URL and AI_LINK_ALLOW_DESTRUCTIVE_DB_TESTS=1 together.");
  }
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Postgres integration refuses non-local and non-CI-service hosts.");
  }
  if (url.search || url.hash) {
    throw new Error("Postgres integration refuses connection-string query parameters and fragments.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) {
    throw new Error("Postgres integration database name must end with _test.");
  }
  if (!decodeURIComponent(url.username).endsWith("_test")) {
    throw new Error("Postgres integration database user must end with _test.");
  }
}

async function cleanDatabase(store) {
  await store.pool.query(
    "TRUNCATE audit_events, connector_probe_evidence, artifacts, approvals, tasks, executor_heartbeats, api_tokens, platform_accounts CASCADE"
  );
}

function tokenSnapshot(activeTokens) {
  return {
    managedNames: ["admin", "executor", "codex"],
    activeTokens: activeTokens.map((record) => ({
      scopes: ["tasks:read"],
      executorId: "",
      expiresAt: null,
      ...record
    }))
  };
}

async function seedRetentionFixture(store) {
  const terminalTaskId = crypto.randomUUID();
  const activeTaskId = crypto.randomUUID();
  const approvalTaskId = crypto.randomUUID();
  const approvalId = crypto.randomUUID();
  const expiredArtifactId = crypto.randomUUID();
  const recentArtifactId = crypto.randomUUID();
  const protectedArtifactId = crypto.randomUUID();
  const heartbeatRevision = crypto.randomUUID();
  const old = "2020-01-01T00:00:00.000Z";
  const older = "2019-12-31T00:00:00.000Z";
  for (const record of [
    [terminalTaskId, "completed"],
    [activeTaskId, "running"],
    [approvalTaskId, "approval_required"]
  ]) {
    await store.pool.query(
      `INSERT INTO tasks (
         id, workflow, status, current_step, input, targets, options, created_by, created_at, updated_at
       ) VALUES ($1, 'full_chain', $2, 'process', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'integration', $3, $3)`,
      [record[0], record[1], old]
    );
  }
  await store.pool.query(
    `INSERT INTO approvals (
       id, task_id, type, title, summary, next_step, status, requested_by, created_at, expires_at
     ) VALUES ($1, $2, 'publish', 'Confirm', '', 'publish', 'pending', 'integration', $3, $3)`,
    [approvalId, approvalTaskId, old]
  );
  await store.pool.query(
    `INSERT INTO artifacts (id, task_id, kind, title, summary, location, created_at)
     VALUES ($1, $2, 'summary', '', '', '', $5), ($3, $4, 'summary', '', '', '', $5)`,
    [expiredArtifactId, terminalTaskId, protectedArtifactId, activeTaskId, old]
  );
  await store.pool.query(
    `INSERT INTO artifacts (id, task_id, kind, title, summary, location, created_at)
     VALUES ($1, $2, 'summary', '', '', '', now())`,
    [recentArtifactId, terminalTaskId]
  );
  await store.pool.query(
    `INSERT INTO executor_heartbeats (
       executor_id, executor_session_id, actor, trusted, revision, schema_version, connectors,
       last_seen_at, expires_at, updated_at
     ) VALUES ('integration-executor', 'integration-session', 'integration', true, $1, '1', '[]'::jsonb, $2, $3, $3)`,
    [heartbeatRevision, older, old]
  );
  await store.pool.query(
    `INSERT INTO connector_probe_evidence (
       executor_id, executor_session_id, platform, operation, qualifier, subject_key,
       schema_version, capability, outcome, issue_code, task_id, attempt_id,
       heartbeat_revision, checked_at, expires_at, updated_at
     ) VALUES (
       'integration-executor', 'integration-session', 'github', 'check_auth', 'repo_read', $6,
       '2', 'check_auth', 'verified', '', $1, $2, $3, $4, $5, $5
     )`,
    [terminalTaskId, crypto.randomUUID(), heartbeatRevision, older, old, "a".repeat(64)]
  );
  await store.pool.query(
    `INSERT INTO audit_events (id, task_id, actor, event_type, detail, created_at)
     VALUES ($1, $2, 'integration', 'task.completed', '{}'::jsonb, $5),
            ($3, $4, 'integration', 'task.leased', '{}'::jsonb, $5)`,
    [crypto.randomUUID(), terminalTaskId, crypto.randomUUID(), activeTaskId, old]
  );
  await store.pool.query(
    `INSERT INTO api_tokens (id, name, token_hash, scopes)
     VALUES ($1, 'manual', $2, '["tasks:read"]'::jsonb)`,
    [crypto.randomUUID(), hashToken("integration-manual-token-value")]
  );
  return {
    terminalTaskId,
    activeTaskId,
    approvalTaskId,
    approvalId,
    expiredArtifactId,
    recentArtifactId,
    protectedArtifactId
  };
}

function retentionPolicy() {
  return {
    artifactDays: 1,
    approvalDays: 1,
    auditDays: 30,
    maintenanceAuditDays: 90,
    heartbeatGraceHours: 1,
    probeGraceDays: 1,
    maxRowsPerTable: 100
  };
}

async function tableCounts(store) {
  const result = await store.pool.query(`
    SELECT
      (SELECT count(*)::int FROM tasks) AS tasks,
      (SELECT count(*)::int FROM approvals) AS approvals,
      (SELECT count(*)::int FROM artifacts) AS artifacts,
      (SELECT count(*)::int FROM executor_heartbeats) AS heartbeats,
      (SELECT count(*)::int FROM connector_probe_evidence) AS probes,
      (SELECT count(*)::int FROM audit_events) AS audits,
      (SELECT count(*)::int FROM api_tokens) AS tokens
  `);
  return result.rows[0];
}

async function exists(store, table, id) {
  const result = await store.pool.query(`SELECT EXISTS(SELECT 1 FROM ${table} WHERE id = $1) AS found`, [id]);
  return result.rows[0].found;
}

async function existsByText(store, table, column, value) {
  const result = await store.pool.query(
    `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${column} = $1) AS found`,
    [value]
  );
  return result.rows[0].found;
}
