import crypto from "node:crypto";
import pg from "pg";
import { TASK_STATUSES } from "../domain/workflow.js";
import { normalizeConnectorProbeEvidence } from "../connectors/probeEvidence.js";
import { normalizeConfiguredApiTokenSnapshot } from "../security/apiTokenLifecycle.js";
import {
  emptyRetentionCounts,
  normalizeRetentionPolicy,
  normalizeRetentionRequest,
  retentionCutoffs,
  retentionResult,
  TERMINAL_TASK_STATUSES
} from "./retention.js";

const { Pool } = pg;

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

function sameTaskRequest(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function taskRequestHash(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rowTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflow: row.workflow,
    status: row.status,
    currentStep: row.current_step,
    input: row.input || {},
    targets: row.targets || [],
    options: row.options || {},
    result: row.result || null,
    summary: row.summary || "",
    error: row.error || null,
    leasedBy: row.leased_by,
    leaseId: row.lease_id,
    leaseExecutorSessionId: row.lease_executor_session_id,
    leaseHeartbeatRevision: row.lease_heartbeat_revision,
    leaseExpiresAt: row.lease_expires_at?.toISOString?.() || row.lease_expires_at || null,
    createdBy: row.created_by,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}

function rowApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    title: row.title,
    summary: row.summary,
    nextStep: row.next_step,
    status: row.status,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by,
    decisionNote: row.decision_note || "",
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    decidedAt: row.decided_at?.toISOString?.() || row.decided_at || null,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at || null
  };
}

function rowArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    location: row.location,
    content: row.content || null,
    retentionUntil: row.retention_until?.toISOString?.() || row.retention_until || null,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function rowAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    actor: row.actor,
    eventType: row.event_type,
    detail: row.detail || {},
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function connectorProbeParams(evidence) {
  return [
    evidence.executorId,
    evidence.executorSessionId,
    evidence.platform,
    evidence.operation,
    evidence.qualifier,
    evidence.subjectKey,
    evidence.schemaVersion,
    evidence.capability,
    evidence.outcome,
    evidence.issueCode,
    evidence.taskId,
    evidence.attemptId,
    evidence.heartbeatRevision,
    evidence.checkedAt,
    evidence.expiresAt
  ];
}

function taskEventType(status) {
  return {
    approval_required: "task.approval_required",
    completed: "task.completed",
    action_required: "task.action_required",
    failed: "task.failed"
  }[status] || "task.updated";
}

function publicProbeAuditDetail(evidence) {
  return {
    schemaVersion: evidence.schemaVersion,
    platform: evidence.platform,
    operation: evidence.operation,
    qualifier: evidence.qualifier,
    subjectBound: Boolean(evidence.subjectKey),
    capability: evidence.capability,
    outcome: evidence.outcome,
    issueCode: evidence.issueCode,
    checkedAt: evidence.checkedAt,
    expiresAt: evidence.expiresAt
  };
}

function rowExecutorHeartbeat(row) {
  if (!row) return null;
  return {
    executorId: row.executor_id,
    executorSessionId: row.executor_session_id || "",
    actor: row.actor,
    trusted: row.trusted === true,
    revision: row.revision,
    schemaVersion: row.schema_version,
    connectors: row.connectors || [],
    lastSeenAt: row.last_seen_at?.toISOString?.() || row.last_seen_at,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at
  };
}

function rowConnectorProbeEvidence(row) {
  if (!row) return null;
  return normalizeConnectorProbeEvidence({
    schemaVersion: row.schema_version,
    executorId: row.executor_id,
    executorSessionId: row.executor_session_id,
    platform: row.platform,
    operation: row.operation,
    qualifier: row.qualifier || "",
    subjectKey: row.subject_key || "",
    capability: row.capability,
    outcome: row.outcome,
    issueCode: row.issue_code || "",
    taskId: row.task_id,
    attemptId: row.attempt_id,
    heartbeatRevision: row.heartbeat_revision,
    checkedAt: row.checked_at?.toISOString?.() || row.checked_at,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at
  });
}

export class PostgresStore {
  constructor({ connectionString, retention } = {}) {
    this.pool = new Pool({ connectionString });
    this.retentionPolicy = normalizeRetentionPolicy(retention);
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        token_hash text NOT NULL UNIQUE,
        scopes jsonb NOT NULL,
        executor_id text,
        expires_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS platform_accounts (
        id uuid PRIMARY KEY,
        platform text NOT NULL,
        display_name text NOT NULL,
        risk_level text NOT NULL DEFAULT 'high',
        auth_mode text NOT NULL DEFAULT 'local_browser',
        status text NOT NULL DEFAULT 'configured',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS executor_heartbeats (
        executor_id text PRIMARY KEY,
        executor_session_id text,
        actor text NOT NULL,
        trusted boolean NOT NULL DEFAULT false,
        revision uuid NOT NULL,
        schema_version text NOT NULL,
        connectors jsonb NOT NULL,
        last_seen_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT executor_heartbeats_id_format CHECK (executor_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
        CONSTRAINT executor_heartbeats_expiry CHECK (expires_at > last_seen_at)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id uuid PRIMARY KEY,
        workflow text NOT NULL,
        status text NOT NULL,
        current_step text NOT NULL,
        input jsonb NOT NULL,
        targets jsonb NOT NULL,
        options jsonb NOT NULL,
        result jsonb,
        summary text NOT NULL DEFAULT '',
        error jsonb,
        leased_by text,
        lease_id uuid,
        lease_executor_session_id text,
        lease_heartbeat_revision uuid,
        lease_expires_at timestamptz,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS task_idempotency_keys (
        created_by text NOT NULL,
        workflow text NOT NULL,
        request_id text NOT NULL,
        request_hash text NOT NULL,
        task_id uuid NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (created_by, workflow, request_id),
        CONSTRAINT task_idempotency_request_id CHECK (length(request_id) BETWEEN 1 AND 120),
        CONSTRAINT task_idempotency_request_hash CHECK (request_hash ~ '^[a-f0-9]{64}$')
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id uuid PRIMARY KEY,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type text NOT NULL,
        title text NOT NULL,
        summary text NOT NULL,
        next_step text NOT NULL,
        status text NOT NULL,
        requested_by text,
        decided_by text,
        decision_note text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        expires_at timestamptz
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id uuid PRIMARY KEY,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind text NOT NULL,
        title text NOT NULL DEFAULT '',
        summary text NOT NULL DEFAULT '',
        location text NOT NULL DEFAULT '',
        content jsonb,
        retention_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id uuid PRIMARY KEY,
        task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
        actor text NOT NULL,
        event_type text NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS connector_probe_evidence (
        executor_id text NOT NULL,
        executor_session_id text NOT NULL,
        platform text NOT NULL,
        operation text NOT NULL,
        qualifier text NOT NULL DEFAULT '',
        subject_key text NOT NULL DEFAULT '',
        schema_version text NOT NULL,
        capability text NOT NULL,
        outcome text NOT NULL,
        issue_code text NOT NULL DEFAULT '',
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        attempt_id uuid NOT NULL,
        heartbeat_revision uuid NOT NULL,
        checked_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (executor_id, platform, operation, qualifier, subject_key),
        CONSTRAINT connector_probe_outcome CHECK (outcome IN ('verified', 'action_required', 'blocked', 'unverified')),
        CONSTRAINT connector_probe_expiry CHECK (expires_at > checked_at)
      );

      ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS executor_id text;
      ALTER TABLE executor_heartbeats ADD COLUMN IF NOT EXISTS trusted boolean NOT NULL DEFAULT false;
      ALTER TABLE executor_heartbeats ADD COLUMN IF NOT EXISTS executor_session_id text;
      ALTER TABLE executor_heartbeats ADD COLUMN IF NOT EXISTS revision uuid;
      UPDATE executor_heartbeats SET revision = md5(executor_id || clock_timestamp()::text)::uuid WHERE revision IS NULL;
      ALTER TABLE executor_heartbeats ALTER COLUMN revision SET NOT NULL;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lease_id uuid;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lease_executor_session_id text;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lease_heartbeat_revision uuid;
      ALTER TABLE connector_probe_evidence ADD COLUMN IF NOT EXISTS executor_session_id text;
      ALTER TABLE connector_probe_evidence ADD COLUMN IF NOT EXISTS qualifier text NOT NULL DEFAULT '';
      ALTER TABLE connector_probe_evidence ADD COLUMN IF NOT EXISTS subject_key text NOT NULL DEFAULT '';
      UPDATE connector_probe_evidence SET executor_session_id = 'legacy-untrusted' WHERE executor_session_id IS NULL;
      ALTER TABLE connector_probe_evidence ALTER COLUMN executor_session_id SET NOT NULL;
      DO $$
      DECLARE probe_primary_key text;
      BEGIN
        SELECT pg_get_constraintdef(oid)
          INTO probe_primary_key
          FROM pg_constraint
         WHERE conrelid = 'connector_probe_evidence'::regclass
           AND contype = 'p';
        IF probe_primary_key IS NULL OR probe_primary_key NOT ILIKE '%qualifier%' THEN
          ALTER TABLE connector_probe_evidence DROP CONSTRAINT IF EXISTS connector_probe_evidence_pkey;
          ALTER TABLE connector_probe_evidence
            ADD CONSTRAINT connector_probe_evidence_pkey
            PRIMARY KEY (executor_id, platform, operation, qualifier, subject_key);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_executor_id ON api_tokens(executor_id) WHERE executor_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_approvals_task_status ON approvals(task_id, status);
      CREATE INDEX IF NOT EXISTS idx_audit_task_created ON audit_events(task_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_executor_heartbeats_expires ON executor_heartbeats(expires_at);
      CREATE INDEX IF NOT EXISTS idx_connector_probe_expires ON connector_probe_evidence(expires_at);
    `);
    const duplicateIdempotencyKeys = await this.pool.query(`
      SELECT 1
        FROM tasks
       WHERE COALESCE(options->>'requestId', '') <> ''
       GROUP BY created_by, workflow, options->>'requestId'
      HAVING count(*) > 1
       LIMIT 1
    `);
    if (duplicateIdempotencyKeys.rowCount > 0) {
      throw new Error("Duplicate legacy task idempotency keys require operator cleanup.");
    }
  }

  async close() {
    await this.pool.end();
  }

  async upsertApiToken(record) {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO api_tokens (id, name, token_hash, scopes, executor_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         scopes = EXCLUDED.scopes,
         executor_id = EXCLUDED.executor_id,
         expires_at = CASE
           WHEN api_tokens.token_hash = EXCLUDED.token_hash THEN api_tokens.expires_at
           ELSE EXCLUDED.expires_at
         END,
         revoked_at = CASE
           WHEN api_tokens.token_hash = EXCLUDED.token_hash THEN api_tokens.revoked_at
           ELSE NULL
         END,
         updated_at = now()
       RETURNING *`,
      [id, record.name, record.tokenHash, json(record.scopes), record.executorId || null, record.expiresAt]
    );
    return {
      id: rows[0].id,
      name: rows[0].name,
      tokenHash: rows[0].token_hash,
      scopes: rows[0].scopes,
      executorId: rows[0].executor_id || "",
      expiresAt: rows[0].expires_at,
      revokedAt: rows[0].revoked_at
    };
  }

  async syncConfiguredApiTokens(snapshot) {
    const { managedNames, managedNamePrefixes, activeTokens } = normalizeConfiguredApiTokenSnapshot(snapshot);
    const activeNames = activeTokens.map((record) => record.name);
    const activeHashes = activeTokens.map((record) => record.tokenHash);
    const managedNamePatterns = managedNamePrefixes.map((prefix) => `${prefix}%`);
    const client = await this.pool.connect();
    const summary = { active: activeTokens.length, inserted: 0, rotated: 0, preserved: 0, revoked: 0 };
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('ai-link-auth-hub'), hashtext('configured-api-tokens-v1'))"
      );
      const existingRows = await client.query(
        `SELECT * FROM api_tokens
         WHERE name = ANY($1::text[])
            OR name LIKE ANY($2::text[])
            OR token_hash = ANY($3::text[])
         FOR UPDATE`,
        [managedNames, managedNamePatterns, activeHashes]
      );
      const existingByName = new Map(existingRows.rows.map((row) => [row.name, row]));
      const existingByHash = new Map(existingRows.rows.map((row) => [row.token_hash, row]));

      for (const record of activeTokens) {
        const hashOwner = existingByHash.get(record.tokenHash);
        if (hashOwner && hashOwner.name !== record.name) {
          throw new Error("Configured API token value is already assigned to another name.");
        }
      }

      for (const record of activeTokens) {
        const existing = existingByName.get(record.name);
        if (existing?.token_hash === record.tokenHash) {
          await client.query(
            `UPDATE api_tokens
             SET scopes = $1, executor_id = $2, updated_at = now()
             WHERE name = $3`,
            [json(record.scopes), record.executorId || null, record.name]
          );
          summary.preserved += 1;
          continue;
        }

        if (existing) {
          await client.query(
            `UPDATE api_tokens
             SET token_hash = $1, scopes = $2, executor_id = $3, expires_at = $4,
                 revoked_at = NULL, updated_at = now()
             WHERE name = $5`,
            [record.tokenHash, json(record.scopes), record.executorId || null, record.expiresAt, record.name]
          );
          summary.rotated += 1;
          continue;
        }

        await client.query(
          `INSERT INTO api_tokens (id, name, token_hash, scopes, executor_id, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            record.name,
            record.tokenHash,
            json(record.scopes),
            record.executorId || null,
            record.expiresAt
          ]
        );
        summary.inserted += 1;
      }

      const revokedRows = await client.query(
        `UPDATE api_tokens
         SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
         WHERE (name = ANY($1::text[]) OR name LIKE ANY($2::text[]))
           AND NOT (name = ANY($3::text[]))
           AND revoked_at IS NULL
         RETURNING name`,
        [managedNames, managedNamePatterns, activeNames]
      );
      summary.revoked = revokedRows.rows.length;
      await client.query("COMMIT");
      return summary;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findApiTokenByHash(tokenHash) {
    const { rows } = await this.pool.query("SELECT * FROM api_tokens WHERE token_hash = $1", [tokenHash]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      tokenHash: row.token_hash,
      scopes: row.scopes,
      executorId: row.executor_id || "",
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at
    };
  }

  async upsertExecutorHeartbeat({ executorId, executorSessionId = "", actor, schemaVersion, connectors, ttlMs, trusted = false }) {
    const revision = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO executor_heartbeats (
         executor_id, executor_session_id, actor, trusted, revision, schema_version, connectors, last_seen_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now() + ($8::double precision * interval '1 millisecond'))
       ON CONFLICT (executor_id) DO UPDATE SET
         executor_session_id = EXCLUDED.executor_session_id,
         actor = EXCLUDED.actor,
         trusted = EXCLUDED.trusted,
         revision = EXCLUDED.revision,
         schema_version = EXCLUDED.schema_version,
         connectors = EXCLUDED.connectors,
         last_seen_at = EXCLUDED.last_seen_at,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()
       RETURNING *`,
      [
        executorId,
        executorSessionId || null,
        actor || "executor",
        trusted === true,
        revision,
        schemaVersion,
        json(connectors),
        ttlMs
      ]
    );
    return rowExecutorHeartbeat(rows[0]);
  }

  async listExecutorHeartbeats({ limit = 50 } = {}) {
    const { rows } = await this.pool.query(
      "SELECT * FROM executor_heartbeats ORDER BY last_seen_at DESC LIMIT $1",
      [limit]
    );
    return rows.map(rowExecutorHeartbeat);
  }

  async upsertConnectorProbeEvidence(value) {
    const evidence = normalizeConnectorProbeEvidence(value);
    if (!evidence) throw new Error("Invalid connector probe evidence.");
    const { rows } = await this.pool.query(
      `INSERT INTO connector_probe_evidence (
         executor_id, executor_session_id, platform, operation, qualifier, subject_key,
         schema_version, capability, outcome, issue_code, task_id, attempt_id,
         heartbeat_revision, checked_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (executor_id, platform, operation, qualifier, subject_key) DO UPDATE SET
         executor_session_id = EXCLUDED.executor_session_id,
         schema_version = EXCLUDED.schema_version,
         capability = EXCLUDED.capability,
         outcome = EXCLUDED.outcome,
         issue_code = EXCLUDED.issue_code,
         task_id = EXCLUDED.task_id,
         attempt_id = EXCLUDED.attempt_id,
         heartbeat_revision = EXCLUDED.heartbeat_revision,
         checked_at = EXCLUDED.checked_at,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()
       WHERE connector_probe_evidence.checked_at <= EXCLUDED.checked_at
       RETURNING *`,
      connectorProbeParams(evidence)
    );
    return rowConnectorProbeEvidence(rows[0]);
  }

  async listConnectorProbeEvidence({ limit = 100 } = {}) {
    const { rows } = await this.pool.query(
      "SELECT * FROM connector_probe_evidence ORDER BY checked_at DESC LIMIT $1",
      [limit]
    );
    return rows.map(rowConnectorProbeEvidence).filter(Boolean);
  }

  async createTask({ workflow, input, targets, options, createdBy }) {
    if (String(options?.requestId || "")) {
      const creation = await this.createTaskIdempotent({ workflow, input, targets, options, createdBy });
      if (creation.conflict) throw idempotencyConflictError();
      return creation.task;
    }
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO tasks (id, workflow, status, current_step, input, targets, options, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, workflow, TASK_STATUSES.QUEUED, options?.startStep || "process", json(input), json(targets), json(options), createdBy]
    );
    await this.appendAudit({ taskId: id, actor: createdBy, eventType: "task.created", detail: { workflow, targets } });
    return rowTask(rows[0]);
  }

  async createTaskIdempotent({ workflow, input, targets, options, createdBy }) {
    const requestId = String(options?.requestId || "");
    if (!requestId) {
      return {
        task: await this.createTask({ workflow, input, targets, options, createdBy }),
        replayed: false,
        conflict: false
      };
    }

    const client = await this.pool.connect();
    const lockKey = `${createdBy}\u0000${workflow}\u0000${requestId}`;
    const request = { input, targets, options };
    const requestHash = taskRequestHash(request);
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('ai-link-task-idempotency-v1'), hashtext($1))",
        [lockKey]
      );
      const existingResult = await client.query(
        `SELECT tasks.*, task_idempotency_keys.request_hash AS idempotency_request_hash
           FROM task_idempotency_keys
           JOIN tasks ON tasks.id = task_idempotency_keys.task_id
          WHERE task_idempotency_keys.created_by = $1
            AND task_idempotency_keys.workflow = $2
            AND task_idempotency_keys.request_id = $3
          FOR UPDATE OF task_idempotency_keys, tasks`,
        [createdBy, workflow, requestId]
      );
      if (existingResult.rows[0]) {
        const task = rowTask(existingResult.rows[0]);
        const matches = existingResult.rows[0].idempotency_request_hash === requestHash
          && sameTaskRequest({ input: task.input, targets: task.targets, options: task.options }, request);
        await client.query("COMMIT");
        return { task, replayed: matches, conflict: !matches };
      }

      const legacyResult = await client.query(
        `SELECT * FROM tasks
          WHERE created_by = $1 AND workflow = $2 AND options->>'requestId' = $3
          ORDER BY created_at ASC
          LIMIT 2
          FOR UPDATE`,
        [createdBy, workflow, requestId]
      );
      if (legacyResult.rows.length > 1) {
        throw new Error("Duplicate legacy task idempotency keys require operator cleanup.");
      }
      if (legacyResult.rows[0]) {
        const task = rowTask(legacyResult.rows[0]);
        const legacyRequest = { input: task.input, targets: task.targets, options: task.options };
        const legacyHash = taskRequestHash(legacyRequest);
        await client.query(
          `INSERT INTO task_idempotency_keys (created_by, workflow, request_id, request_hash, task_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [createdBy, workflow, requestId, legacyHash, task.id]
        );
        const matches = legacyHash === requestHash && sameTaskRequest(legacyRequest, request);
        await client.query("COMMIT");
        return { task, replayed: matches, conflict: !matches };
      }

      const id = crypto.randomUUID();
      const inserted = await client.query(
        `INSERT INTO tasks (id, workflow, status, current_step, input, targets, options, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, workflow, TASK_STATUSES.QUEUED, options?.startStep || "process", json(input), json(targets), json(options), createdBy]
      );
      await client.query(
        `INSERT INTO task_idempotency_keys (created_by, workflow, request_id, request_hash, task_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [createdBy, workflow, requestId, requestHash, id]
      );
      await client.query(
        `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), id, createdBy, "task.created", json({ workflow, targets })]
      );
      await client.query("COMMIT");
      return { task: rowTask(inserted.rows[0]), replayed: false, conflict: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTask(id) {
    const { rows } = await this.pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
    return rowTask(rows[0]);
  }

  async listTasks({ limit = 50, status = "", createdBy = "" } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM tasks
       WHERE ($1::text = '' OR status = $1)
         AND ($2::text = '' OR created_by = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [status || "", createdBy || "", limit]
    );
    return rows.map(rowTask);
  }

  async leaseTask({ executorId, executorSessionId = "", leaseMs, connectorProbeKeys = [], heartbeatRevision = "" }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM tasks
         WHERE (status = $1 OR (status = $2 AND lease_expires_at < now()))
           AND (
             COALESCE(options->>'evidenceIntent', '') <> 'connector_probe'
             OR ($3::boolean = true AND CONCAT(input->>'platform', '/', input->>'operation') = ANY($4::text[]))
           )
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [TASK_STATUSES.QUEUED, TASK_STATUSES.RUNNING, Boolean(heartbeatRevision), connectorProbeKeys]
      );
      if (!rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const taskId = rows[0].id;
      const leaseId = crypto.randomUUID();
      const probeTask = rows[0].options?.evidenceIntent === "connector_probe";
      const updated = await client.query(
        `UPDATE tasks
         SET status = $1,
             leased_by = $2,
             lease_id = $3,
             lease_executor_session_id = $4,
             lease_heartbeat_revision = $5,
             lease_expires_at = now() + ($6 || ' milliseconds')::interval,
             updated_at = now()
         WHERE id = $7
         RETURNING *`,
        [
          TASK_STATUSES.RUNNING,
          executorId,
          leaseId,
          executorSessionId || null,
          probeTask ? heartbeatRevision : null,
          String(leaseMs),
          taskId
        ]
      );
      await client.query(
        `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), taskId, executorId, "task.leased", json({ currentStep: updated.rows[0].current_step })]
      );
      await client.query("COMMIT");
      return rowTask(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markTaskNeedsApproval({ taskId, summary, result, approval, artifacts = [], actor }) {
    const { rows } = await this.pool.query(
      `UPDATE tasks
       SET status = $1, summary = $2, result = $3, leased_by = NULL, lease_id = NULL,
           lease_executor_session_id = NULL, lease_heartbeat_revision = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [TASK_STATUSES.APPROVAL_REQUIRED, summary || "", json(result || null), taskId]
    );
    for (const artifact of artifacts) {
      await this.addArtifact({ taskId, ...artifact });
    }
    const createdApproval = await this.createApproval({
      taskId,
      type: approval?.type || "publish",
      title: approval?.title || "Confirm action",
      summary: approval?.summary || summary || "",
      nextStep: approval?.nextStep || "publish",
      requestedBy: actor
    });
    await this.appendAudit({ taskId, actor, eventType: "task.approval_required", detail: { approvalId: createdApproval.id } });
    return { task: rowTask(rows[0]), approval: createdApproval };
  }

  async completeTask({ taskId, summary, result, artifacts = [], actor }) {
    const { rows } = await this.pool.query(
      `UPDATE tasks
       SET status = $1, summary = $2, result = $3, leased_by = NULL, lease_id = NULL,
           lease_executor_session_id = NULL, lease_heartbeat_revision = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [TASK_STATUSES.COMPLETED, summary || "", json(result || null), taskId]
    );
    for (const artifact of artifacts) {
      await this.addArtifact({ taskId, ...artifact });
    }
    await this.appendAudit({ taskId, actor, eventType: "task.completed", detail: { status: TASK_STATUSES.COMPLETED } });
    return rowTask(rows[0]);
  }

  async markTaskNeedsAction({ taskId, summary, result, error, artifacts = [], actor }) {
    const { rows } = await this.pool.query(
      `UPDATE tasks
       SET status = $1, summary = $2, result = $3, error = $4, leased_by = NULL, lease_id = NULL,
           lease_executor_session_id = NULL, lease_heartbeat_revision = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [TASK_STATUSES.ACTION_REQUIRED, summary || "", json(result || null), json(error || null), taskId]
    );
    for (const artifact of artifacts) {
      await this.addArtifact({ taskId, ...artifact });
    }
    await this.appendAudit({ taskId, actor, eventType: "task.action_required", detail: { error } });
    return rowTask(rows[0]);
  }

  async failTask({ taskId, error, result, actor }) {
    const { rows } = await this.pool.query(
      `UPDATE tasks
       SET status = $1, error = $2, result = $3, leased_by = NULL, lease_id = NULL,
           lease_executor_session_id = NULL, lease_heartbeat_revision = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [TASK_STATUSES.FAILED, json(error || {}), json(result || null), taskId]
    );
    await this.appendAudit({ taskId, actor, eventType: "task.failed", detail: { error } });
    return rowTask(rows[0]);
  }

  async settleTaskResult({
    taskId,
    executorId,
    executorSessionId,
    leaseId,
    taskStatus,
    resultStatus,
    summary,
    result,
    error,
    approval,
    artifacts = [],
    actor,
    aiLinkAudit
  }) {
    if (![
      TASK_STATUSES.APPROVAL_REQUIRED,
      TASK_STATUSES.COMPLETED,
      TASK_STATUSES.ACTION_REQUIRED,
      TASK_STATUSES.FAILED
    ].includes(taskStatus)) {
      return null;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE tasks
         SET status = $1,
             summary = $2,
             result = $3,
             error = $4,
             leased_by = NULL,
             lease_id = NULL,
             lease_executor_session_id = NULL,
             lease_heartbeat_revision = NULL,
             lease_expires_at = NULL,
             updated_at = now()
         WHERE id = $5
           AND status = $6
           AND COALESCE(options->>'evidenceIntent', '') <> 'connector_probe'
           AND leased_by = $7
           AND lease_executor_session_id = $8
           AND lease_id = $9
           AND lease_expires_at > now()
         RETURNING *`,
        [
          taskStatus,
          summary || "",
          json(result || null),
          json(error || null),
          taskId,
          TASK_STATUSES.RUNNING,
          executorId,
          executorSessionId,
          leaseId
        ]
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      for (const artifact of artifacts) {
        await client.query(
          `INSERT INTO artifacts (id, task_id, kind, title, summary, location, content, retention_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            taskId,
            artifact.kind || "summary",
            artifact.title || "",
            artifact.summary || "",
            artifact.location || "",
            json(artifact.content || null),
            artifact.retentionUntil || null
          ]
        );
      }

      let createdApproval = null;
      if (taskStatus === TASK_STATUSES.APPROVAL_REQUIRED) {
        const approvalId = crypto.randomUUID();
        const approvalRows = await client.query(
          `INSERT INTO approvals (
             id, task_id, type, title, summary, next_step, status, requested_by, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, now() + ($8::int * interval '1 day'))
           RETURNING *`,
          [
            approvalId,
            taskId,
            approval?.type || "publish",
            approval?.title || "Confirm action",
            approval?.summary || summary || "",
            approval?.nextStep || "publish",
            actor,
            this.retentionPolicy.approvalDays
          ]
        );
        createdApproval = rowApproval(approvalRows.rows[0]);
      }

      const eventDetail = createdApproval
        ? { approvalId: createdApproval.id }
        : taskStatus === TASK_STATUSES.COMPLETED
          ? { status: taskStatus }
          : { error: error || null };
      await client.query(
        `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), taskId, actor, taskEventType(taskStatus), json(eventDetail)]
      );
      if (aiLinkAudit) {
        await client.query(
          `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
           VALUES ($1, $2, $3, 'ai_link.audit', $4)`,
          [crypto.randomUUID(), taskId, actor, json({ status: resultStatus, audit: aiLinkAudit })]
        );
      }

      await client.query("COMMIT");
      return { task: rowTask(updated.rows[0]), approval: createdApproval };
    } catch (error_) {
      await client.query("ROLLBACK");
      throw error_;
    } finally {
      client.release();
    }
  }

  async settleConnectorProbeTask({
    taskId,
    executorId,
    leaseId,
    taskStatus,
    summary,
    result,
    error,
    actor,
    evidence
  }) {
    const normalizedEvidence = normalizeConnectorProbeEvidence(evidence);
    if (
      !normalizedEvidence
      || normalizedEvidence.taskId !== taskId
      || normalizedEvidence.executorId !== executorId
      || normalizedEvidence.attemptId !== leaseId
      || ![TASK_STATUSES.COMPLETED, TASK_STATUSES.ACTION_REQUIRED, TASK_STATUSES.FAILED].includes(taskStatus)
    ) {
      return null;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE tasks
         SET status = $1,
             summary = $2,
             result = $3,
             error = $4,
             leased_by = NULL,
             lease_id = NULL,
             lease_executor_session_id = NULL,
             lease_heartbeat_revision = NULL,
             lease_expires_at = NULL,
             updated_at = now()
         WHERE id = $5
           AND status = $6
           AND leased_by = $7
           AND lease_id = $8
           AND lease_executor_session_id = $9
           AND lease_heartbeat_revision = $10
           AND lease_expires_at > now()
         RETURNING *`,
        [
          taskStatus,
          summary || "",
          json(result || null),
          json(error || null),
          taskId,
          TASK_STATUSES.RUNNING,
          executorId,
          leaseId,
          normalizedEvidence.executorSessionId,
          normalizedEvidence.heartbeatRevision
        ]
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `INSERT INTO connector_probe_evidence (
           executor_id, executor_session_id, platform, operation, qualifier, subject_key,
           schema_version, capability, outcome, issue_code, task_id, attempt_id,
           heartbeat_revision, checked_at, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (executor_id, platform, operation, qualifier, subject_key) DO UPDATE SET
           executor_session_id = EXCLUDED.executor_session_id,
           schema_version = EXCLUDED.schema_version,
           capability = EXCLUDED.capability,
           outcome = EXCLUDED.outcome,
           issue_code = EXCLUDED.issue_code,
           task_id = EXCLUDED.task_id,
           attempt_id = EXCLUDED.attempt_id,
           heartbeat_revision = EXCLUDED.heartbeat_revision,
           checked_at = EXCLUDED.checked_at,
           expires_at = EXCLUDED.expires_at,
           updated_at = now()
         WHERE connector_probe_evidence.checked_at <= EXCLUDED.checked_at`,
        connectorProbeParams(normalizedEvidence)
      );
      await client.query(
        `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
         VALUES ($1, $2, $3, $4, $5), ($6, $2, $3, $7, $8)`,
        [
          crypto.randomUUID(),
          taskId,
          actor,
          taskEventType(taskStatus),
          json({ status: taskStatus }),
          crypto.randomUUID(),
          "connector.probe_recorded",
          json(publicProbeAuditDetail(normalizedEvidence))
        ]
      );
      await client.query("COMMIT");
      return rowTask(updated.rows[0]);
    } catch (error_) {
      await client.query("ROLLBACK");
      throw error_;
    } finally {
      client.release();
    }
  }

  async retryTask({ taskId, actor, note = "" }) {
    const { rows } = await this.pool.query(
      `UPDATE tasks
       SET status = $1, error = NULL, leased_by = NULL, lease_id = NULL,
           lease_executor_session_id = NULL, lease_heartbeat_revision = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $2 AND status = ANY($3::text[])
       RETURNING *`,
      [TASK_STATUSES.QUEUED, taskId, [TASK_STATUSES.ACTION_REQUIRED, TASK_STATUSES.FAILED]]
    );
    if (!rows[0]) return null;
    await this.appendAudit({ taskId, actor, eventType: "task.requeued", detail: { note } });
    return rowTask(rows[0]);
  }

  async createApproval({ taskId, type, title, summary, nextStep, requestedBy }) {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO approvals (id, task_id, type, title, summary, next_step, status, requested_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, now() + ($8::int * interval '1 day'))
       RETURNING *`,
      [id, taskId, type, title, summary, nextStep, requestedBy, this.retentionPolicy.approvalDays]
    );
    return rowApproval(rows[0]);
  }

  async getApproval(id) {
    const { rows } = await this.pool.query("SELECT * FROM approvals WHERE id = $1", [id]);
    return rowApproval(rows[0]);
  }

  async listApprovals({ status } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM approvals
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC`,
      [status || null]
    );
    return rows.map(rowApproval);
  }

  async decideApproval({ taskId, approvalId, approved, actor, note }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const approvalRows = await client.query(
        "SELECT * FROM approvals WHERE id = $1 AND task_id = $2 FOR UPDATE",
        [approvalId, taskId]
      );
      const taskRows = await client.query("SELECT * FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
      if (!approvalRows.rows[0] || !taskRows.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const approval = approvalRows.rows[0];
      if (approval.status !== "pending") {
        await client.query("COMMIT");
        return {
          task: rowTask(taskRows.rows[0]),
          approval: rowApproval(approval),
          changed: false,
          reason: approval.status === "expired" ? "approval_expired" : "approval_already_decided"
        };
      }
      if (approval.expires_at) {
        const expiredApproval = await client.query(
          `UPDATE approvals
           SET status = 'expired', decided_by = $1, decision_note = $2, decided_at = now()
           WHERE id = $3 AND status = 'pending' AND expires_at <= now()
           RETURNING *`,
          [actor, "Expired before decision.", approvalId]
        );
        if (expiredApproval.rows[0]) {
          const expiredTask = await client.query(
            `UPDATE tasks
             SET status = $1, error = $2, updated_at = now()
             WHERE id = $3 AND status = $4
             RETURNING *`,
            [
              TASK_STATUSES.ACTION_REQUIRED,
              json({ code: "approval_expired" }),
              taskId,
              TASK_STATUSES.APPROVAL_REQUIRED
            ]
          );
          await client.query(
            `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
             VALUES ($1, $2, $3, 'approval.expired', $4)`,
            [crypto.randomUUID(), taskId, actor, json({ approvalId })]
          );
          await client.query("COMMIT");
          return {
            task: rowTask(expiredTask.rows[0] || taskRows.rows[0]),
            approval: rowApproval(expiredApproval.rows[0]),
            changed: false,
            reason: "approval_expired"
          };
        }
      }
      if (taskRows.rows[0].status !== TASK_STATUSES.APPROVAL_REQUIRED) {
        await client.query("COMMIT");
        return {
          task: rowTask(taskRows.rows[0]),
          approval: rowApproval(approval),
          changed: false,
          reason: "approval_context_stale"
        };
      }
      const newApprovalStatus = approved ? "approved" : "rejected";
      const newTaskStatus = approved ? TASK_STATUSES.QUEUED : TASK_STATUSES.CANCELLED;
      const nextStep = approved ? approval.next_step || "publish" : taskRows.rows[0].current_step;

      const updatedApproval = await client.query(
        `UPDATE approvals
         SET status = $1, decided_by = $2, decision_note = $3, decided_at = now()
         WHERE id = $4
         RETURNING *`,
        [newApprovalStatus, actor, note || "", approvalId]
      );
      const updatedTask = await client.query(
        `UPDATE tasks
         SET status = $1, current_step = $2, updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [newTaskStatus, nextStep, taskId]
      );
      await client.query(
        `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), taskId, actor, approved ? "approval.approved" : "approval.rejected", json({ approvalId })]
      );
      await client.query("COMMIT");
      return { task: rowTask(updatedTask.rows[0]), approval: rowApproval(updatedApproval.rows[0]), changed: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addArtifact({ taskId, kind, title, summary, retentionUntil, location, content }) {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO artifacts (id, task_id, kind, title, summary, location, content, retention_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, taskId, kind || "summary", title || "", summary || "", location || "", json(content || null), retentionUntil || null]
    );
    return rowArtifact(rows[0]);
  }

  async listArtifacts(taskId) {
    const { rows } = await this.pool.query("SELECT * FROM artifacts WHERE task_id = $1 ORDER BY created_at ASC", [taskId]);
    return rows.map(rowArtifact);
  }

  async appendAudit({ taskId = null, actor, eventType, detail = {} }) {
    const { rows } = await this.pool.query(
      `INSERT INTO audit_events (id, task_id, actor, event_type, detail)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [crypto.randomUUID(), taskId, actor || "system", eventType, json(detail)]
    );
    return rowAudit(rows[0]);
  }

  async listAuditEvents({ taskId, eventType, limit = 100 } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM audit_events
       WHERE ($1::uuid IS NULL OR task_id = $1)
         AND ($2::text IS NULL OR event_type = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [taskId || null, eventType || null, limit]
    );
    return rows.map(rowAudit);
  }

  async runRetentionMaintenance(options = {}) {
    const initialRequest = normalizeRetentionRequest({
      ...options,
      policy: { ...this.retentionPolicy, ...(options.policy || {}) }
    });
    const client = await this.pool.connect();
    let transactionStarted = false;
    try {
      await client.query(initialRequest.apply
        ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
        : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      transactionStarted = true;
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      const lock = await client.query(
        "SELECT pg_try_advisory_xact_lock(hashtext('ai-link-auth-hub'), hashtext('retention-v1')) AS locked"
      );
      if (lock.rows[0]?.locked !== true) {
        throw new Error("Auth Hub retention maintenance is already running.");
      }
      const time = await client.query("SELECT transaction_timestamp() AS as_of");
      const request = {
        ...initialRequest,
        asOf: time.rows[0].as_of?.toISOString?.() || String(time.rows[0].as_of)
      };
      const cutoffs = retentionCutoffs(request.asOf, request.policy);
      const selected = await selectPostgresRetentionCandidates(client, request, cutoffs);
      const candidates = retentionCounts(selected);
      const hasMore = Object.values(selected).some((records) => records.hasMore);
      if (!request.apply) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return retentionResult({
          request,
          candidates,
          changed: emptyRetentionCounts(),
          hasMore,
          cutoffs
        });
      }

      const changed = emptyRetentionCounts();
      const approvalIds = selected.approvals.rows.map((record) => record.id);
      if (approvalIds.length > 0) {
        const expired = await client.query(
          `UPDATE approvals
           SET status = 'expired', decided_by = $1, decision_note = $2, decided_at = $3
           WHERE id = ANY($4::uuid[]) AND status = 'pending'
           RETURNING id, task_id`,
          [request.actor, "Expired by retention policy.", request.asOf, approvalIds]
        );
        changed.approvals = expired.rowCount || 0;
        const expiredTaskIds = expired.rows.map((record) => record.task_id);
        if (expiredTaskIds.length > 0) {
          await client.query(
            `UPDATE tasks
             SET status = $1, error = $2, updated_at = $3
             WHERE id = ANY($4::uuid[]) AND status = $5`,
            [
              TASK_STATUSES.ACTION_REQUIRED,
              json({ code: "approval_expired" }),
              request.asOf,
              expiredTaskIds,
              TASK_STATUSES.APPROVAL_REQUIRED
            ]
          );
          await insertApprovalExpiredAudit(client, expired.rows, request);
        }
      }

      changed.artifacts = await deleteByIds(client, "artifacts", selected.artifacts.rows.map((record) => record.id));
      changed.executorHeartbeats = await deleteByTextIds(
        client,
        "executor_heartbeats",
        "executor_id",
        selected.executorHeartbeats.rows.map((record) => record.executor_id)
      );
      changed.connectorProbes = await deleteConnectorProbes(client, selected.connectorProbes.rows);
      changed.auditEvents = await deleteByIds(
        client,
        "audit_events",
        selected.auditEvents.rows.map((record) => record.id)
      );
      await client.query(
        `INSERT INTO audit_events (id, task_id, actor, event_type, detail, created_at)
         VALUES ($1, NULL, $2, 'maintenance.retention_applied', $3, $4)`,
        [
          request.runId,
          request.actor,
          json({ policyVersion: "1", changed, cutoffs, hasMore }),
          request.asOf
        ]
      );
      await client.query("COMMIT");
      transactionStarted = false;
      return retentionResult({ request, candidates, changed, hasMore, cutoffs });
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

async function selectPostgresRetentionCandidates(client, request, cutoffs) {
  const limit = request.policy.maxRowsPerTable;
  const rowLimit = limit + 1;
  const lock = request.apply ? " FOR UPDATE OF target SKIP LOCKED" : "";
  const approvals = await client.query(
    `SELECT target.id, target.task_id
     FROM approvals target
     WHERE target.status = 'pending'
       AND ((target.expires_at IS NOT NULL AND target.expires_at <= $1)
         OR (target.expires_at IS NULL AND target.created_at <= $2))
     ORDER BY COALESCE(target.expires_at, target.created_at), target.id
     LIMIT $3${lock}`,
    [request.asOf, cutoffs.approval, rowLimit]
  );
  const artifacts = await client.query(
    `SELECT target.id
     FROM artifacts target
     JOIN tasks task ON task.id = target.task_id
     WHERE task.status = ANY($1::text[])
       AND ((target.retention_until IS NOT NULL AND target.retention_until <= $2)
         OR (target.retention_until IS NULL AND target.created_at <= $3))
     ORDER BY COALESCE(target.retention_until, target.created_at), target.id
     LIMIT $4${lock}`,
    [TERMINAL_TASK_STATUSES, request.asOf, cutoffs.artifact, rowLimit]
  );
  const heartbeats = await client.query(
    `SELECT target.executor_id
     FROM executor_heartbeats target
     WHERE target.expires_at <= $1
     ORDER BY target.expires_at, target.executor_id
     LIMIT $2${lock}`,
    [cutoffs.heartbeat, rowLimit]
  );
  const probes = await client.query(
    `SELECT target.executor_id, target.platform, target.operation
     FROM connector_probe_evidence target
     WHERE target.expires_at <= $1
     ORDER BY target.expires_at, target.executor_id, target.platform, target.operation
     LIMIT $2${lock}`,
    [cutoffs.probe, rowLimit]
  );
  const auditEvents = await client.query(
    `SELECT target.id
     FROM audit_events target
     LEFT JOIN tasks task ON task.id = target.task_id
     WHERE ((target.event_type LIKE 'maintenance.%' AND target.created_at <= $1)
       OR (target.event_type NOT LIKE 'maintenance.%' AND target.created_at <= $2))
       AND (target.task_id IS NULL OR task.status = ANY($3::text[]))
     ORDER BY target.created_at, target.id
     LIMIT $4${lock}`,
    [cutoffs.maintenanceAudit, cutoffs.audit, TERMINAL_TASK_STATUSES, rowLimit]
  );
  return {
    approvals: boundedRows(approvals.rows, limit),
    artifacts: boundedRows(artifacts.rows, limit),
    executorHeartbeats: boundedRows(heartbeats.rows, limit),
    connectorProbes: boundedRows(probes.rows, limit),
    auditEvents: boundedRows(auditEvents.rows, limit)
  };
}

function boundedRows(rows, limit) {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

function retentionCounts(selected) {
  return Object.fromEntries(
    Object.entries(selected).map(([name, selection]) => [name, selection.rows.length])
  );
}

async function deleteByIds(client, table, ids) {
  if (ids.length === 0) return 0;
  const result = await client.query(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [ids]);
  return result.rowCount || 0;
}

async function deleteByTextIds(client, table, column, ids) {
  if (ids.length === 0) return 0;
  const result = await client.query(`DELETE FROM ${table} WHERE ${column} = ANY($1::text[])`, [ids]);
  return result.rowCount || 0;
}

async function deleteConnectorProbes(client, records) {
  if (records.length === 0) return 0;
  const result = await client.query(
    `DELETE FROM connector_probe_evidence target
     USING unnest($1::text[], $2::text[], $3::text[]) AS victim(executor_id, platform, operation)
     WHERE target.executor_id = victim.executor_id
       AND target.platform = victim.platform
       AND target.operation = victim.operation`,
    [
      records.map((record) => record.executor_id),
      records.map((record) => record.platform),
      records.map((record) => record.operation)
    ]
  );
  return result.rowCount || 0;
}

async function insertApprovalExpiredAudit(client, records, request) {
  const ids = records.map(() => crypto.randomUUID());
  const taskIds = records.map((record) => record.task_id);
  const details = records.map((record) => json({ approvalId: record.id }));
  await client.query(
    `INSERT INTO audit_events (id, task_id, actor, event_type, detail, created_at)
     SELECT victim.id, victim.task_id, $4, 'approval.expired', victim.detail, $5
     FROM unnest($1::uuid[], $2::uuid[], $3::jsonb[]) AS victim(id, task_id, detail)`,
    [ids, taskIds, details, request.actor, request.asOf]
  );
}

function idempotencyConflictError() {
  return Object.assign(new Error("Task idempotency key conflicts with an existing request."), {
    code: "idempotency_conflict"
  });
}
