import crypto from "node:crypto";
import pg from "pg";
import { TASK_STATUSES } from "../domain/workflow.js";

const { Pool } = pg;

function json(value) {
  return value == null ? null : JSON.stringify(value);
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

export class PostgresStore {
  constructor({ connectionString }) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        token_hash text NOT NULL UNIQUE,
        scopes jsonb NOT NULL,
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
        lease_expires_at timestamptz,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
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

      CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_approvals_task_status ON approvals(task_id, status);
      CREATE INDEX IF NOT EXISTS idx_audit_task_created ON audit_events(task_id, created_at DESC);
    `);
  }

  async close() {
    await this.pool.end();
  }

  async upsertApiToken(record) {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO api_tokens (id, name, token_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         scopes = EXCLUDED.scopes,
         expires_at = EXCLUDED.expires_at,
         revoked_at = NULL,
         updated_at = now()
       RETURNING *`,
      [id, record.name, record.tokenHash, json(record.scopes), record.expiresAt]
    );
    return {
      id: rows[0].id,
      name: rows[0].name,
      tokenHash: rows[0].token_hash,
      scopes: rows[0].scopes,
      expiresAt: rows[0].expires_at,
      revokedAt: rows[0].revoked_at
    };
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
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at
    };
  }

  async createTask({ workflow, input, targets, options, createdBy }) {
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

  async getTask(id) {
    const { rows } = await this.pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
    return rowTask(rows[0]);
  }

  async listTasks({ limit = 50 } = {}) {
    const { rows } = await this.pool.query("SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1", [limit]);
    return rows.map(rowTask);
  }

  async leaseTask({ executorId, leaseMs }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM tasks
         WHERE status = $1 OR (status = $2 AND lease_expires_at < now())
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [TASK_STATUSES.QUEUED, TASK_STATUSES.RUNNING]
      );
      if (!rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const taskId = rows[0].id;
      const updated = await client.query(
        `UPDATE tasks
         SET status = $1,
             leased_by = $2,
             lease_expires_at = now() + ($3 || ' milliseconds')::interval,
             updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [TASK_STATUSES.RUNNING, executorId, String(leaseMs), taskId]
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
       SET status = $1, summary = $2, result = $3, leased_by = NULL, lease_expires_at = NULL, updated_at = now()
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
       SET status = $1, summary = $2, result = $3, leased_by = NULL, lease_expires_at = NULL, updated_at = now()
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

  async failTask({ taskId, error, actor }) {
    const { rows } = await this.pool.query(
      `UPDATE tasks
       SET status = $1, error = $2, leased_by = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [TASK_STATUSES.FAILED, json(error || {}), taskId]
    );
    await this.appendAudit({ taskId, actor, eventType: "task.failed", detail: { error } });
    return rowTask(rows[0]);
  }

  async createApproval({ taskId, type, title, summary, nextStep, requestedBy }) {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO approvals (id, task_id, type, title, summary, next_step, status, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [id, taskId, type, title, summary, nextStep, requestedBy]
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
        return { task: rowTask(taskRows.rows[0]), approval: rowApproval(approval), changed: false };
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

  async listAuditEvents({ taskId, limit = 100 } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM audit_events
       WHERE ($1::uuid IS NULL OR task_id = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [taskId || null, limit]
    );
    return rows.map(rowAudit);
  }
}
