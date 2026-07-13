import crypto from "node:crypto";
import { APPROVAL_STATUSES, TASK_STATUSES } from "../domain/workflow.js";
import { normalizeConnectorProbeEvidence } from "../connectors/probeEvidence.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

export class MemoryStore {
  constructor() {
    this.tasks = new Map();
    this.approvals = new Map();
    this.artifacts = new Map();
    this.auditEvents = [];
    this.apiTokens = new Map();
    this.executorHeartbeats = new Map();
    this.connectorProbeEvidence = new Map();
  }

  async init() {}

  async close() {}

  async upsertApiToken(record) {
    const existing = [...this.apiTokens.values()].find((item) => item.name === record.name);
    const next = {
      id: existing?.id || crypto.randomUUID(),
      name: record.name,
      tokenHash: record.tokenHash,
      scopes: record.scopes,
      executorId: record.executorId || "",
      expiresAt: record.expiresAt || null,
      revokedAt: null,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    this.apiTokens.set(next.tokenHash, next);
    return clone(next);
  }

  async findApiTokenByHash(tokenHash) {
    return clone(this.apiTokens.get(tokenHash));
  }

  async upsertExecutorHeartbeat({ executorId, executorSessionId = "", actor, schemaVersion, connectors, ttlMs, trusted = false }) {
    const now = new Date();
    const heartbeat = {
      executorId,
      executorSessionId,
      actor: actor || "executor",
      trusted: trusted === true,
      revision: crypto.randomUUID(),
      schemaVersion,
      connectors,
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString()
    };
    this.executorHeartbeats.set(executorId, heartbeat);
    return clone(heartbeat);
  }

  async listExecutorHeartbeats({ limit = 50 } = {}) {
    return [...this.executorHeartbeats.values()]
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, limit)
      .map(clone);
  }

  async upsertConnectorProbeEvidence(value) {
    const evidence = normalizeConnectorProbeEvidence(value);
    if (!evidence) {
      throw new Error("Invalid connector probe evidence.");
    }
    const key = [evidence.executorId, evidence.platform, evidence.operation].join(":");
    const existing = this.connectorProbeEvidence.get(key);
    if (!existing || existing.checkedAt <= evidence.checkedAt) {
      this.connectorProbeEvidence.set(key, evidence);
      return clone(evidence);
    }
    return clone(existing);
  }

  async listConnectorProbeEvidence({ limit = 100 } = {}) {
    return [...this.connectorProbeEvidence.values()]
      .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))
      .slice(0, limit)
      .map(clone);
  }

  async createTask({ workflow, input, targets, options, createdBy }) {
    const id = crypto.randomUUID();
    const task = {
      id,
      workflow,
      status: TASK_STATUSES.QUEUED,
      currentStep: options?.startStep || "process",
      input,
      targets,
      options,
      result: null,
      summary: "",
      error: null,
      leasedBy: null,
      leaseId: null,
      leaseExecutorSessionId: null,
      leaseHeartbeatRevision: null,
      leaseExpiresAt: null,
      createdBy,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.tasks.set(id, task);
    await this.appendAudit({ taskId: id, actor: createdBy, eventType: "task.created", detail: { workflow, targets } });
    return clone(task);
  }

  async getTask(id) {
    return clone(this.tasks.get(id));
  }

  async listTasks({ limit = 50, status = "" } = {}) {
    return [...this.tasks.values()]
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  async leaseTask({ executorId, executorSessionId = "", leaseMs, connectorProbeKeys = [], heartbeatRevision = "" }) {
    const now = Date.now();
    const allowedProbeKeys = new Set(connectorProbeKeys);
    const task = [...this.tasks.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .find((item) => {
        const available = item.status === TASK_STATUSES.QUEUED
          || (item.status === TASK_STATUSES.RUNNING && item.leaseExpiresAt && new Date(item.leaseExpiresAt).getTime() < now);
        if (!available) return false;
        if (item.options?.evidenceIntent !== "connector_probe") return true;
        return Boolean(heartbeatRevision)
          && allowedProbeKeys.has(`${item.input?.platform}/${item.input?.operation}`);
      });

    if (!task) return null;
    task.status = TASK_STATUSES.RUNNING;
    task.leasedBy = executorId;
    task.leaseId = crypto.randomUUID();
    task.leaseExecutorSessionId = executorSessionId || null;
    task.leaseHeartbeatRevision = task.options?.evidenceIntent === "connector_probe"
      ? heartbeatRevision
      : null;
    task.leaseExpiresAt = new Date(now + leaseMs).toISOString();
    task.updatedAt = nowIso();
    await this.appendAudit({ taskId: task.id, actor: executorId, eventType: "task.leased", detail: { currentStep: task.currentStep } });
    return clone(task);
  }

  async markTaskNeedsApproval({ taskId, summary, result, approval, artifacts = [], actor }) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TASK_STATUSES.APPROVAL_REQUIRED;
    task.summary = summary || task.summary;
    task.result = result || task.result;
    task.leasedBy = null;
    task.leaseId = null;
    task.leaseExecutorSessionId = null;
    task.leaseHeartbeatRevision = null;
    task.leaseExpiresAt = null;
    task.updatedAt = nowIso();

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
    return { task: clone(task), approval: createdApproval };
  }

  async completeTask({ taskId, summary, result, artifacts = [], actor }) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TASK_STATUSES.COMPLETED;
    task.summary = summary || task.summary;
    task.result = result || task.result;
    task.leasedBy = null;
    task.leaseId = null;
    task.leaseExecutorSessionId = null;
    task.leaseHeartbeatRevision = null;
    task.leaseExpiresAt = null;
    task.updatedAt = nowIso();
    for (const artifact of artifacts) {
      await this.addArtifact({ taskId, ...artifact });
    }
    await this.appendAudit({ taskId, actor, eventType: "task.completed", detail: { currentStep: task.currentStep } });
    return clone(task);
  }

  async markTaskNeedsAction({ taskId, summary, result, error, artifacts = [], actor }) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TASK_STATUSES.ACTION_REQUIRED;
    task.summary = summary || task.summary;
    task.result = result || task.result;
    task.error = error || null;
    task.leasedBy = null;
    task.leaseId = null;
    task.leaseExecutorSessionId = null;
    task.leaseHeartbeatRevision = null;
    task.leaseExpiresAt = null;
    task.updatedAt = nowIso();
    for (const artifact of artifacts) {
      await this.addArtifact({ taskId, ...artifact });
    }
    await this.appendAudit({ taskId, actor, eventType: "task.action_required", detail: { error } });
    return clone(task);
  }

  async failTask({ taskId, error, result, actor }) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TASK_STATUSES.FAILED;
    task.error = error;
    task.result = result || task.result;
    task.leasedBy = null;
    task.leaseId = null;
    task.leaseExecutorSessionId = null;
    task.leaseHeartbeatRevision = null;
    task.leaseExpiresAt = null;
    task.updatedAt = nowIso();
    await this.appendAudit({ taskId, actor, eventType: "task.failed", detail: { error } });
    return clone(task);
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
    const task = this.tasks.get(taskId);
    const normalizedEvidence = normalizeConnectorProbeEvidence(evidence);
    if (
      !task
      || !normalizedEvidence
      || task.status !== TASK_STATUSES.RUNNING
      || task.leasedBy !== executorId
      || task.leaseId !== leaseId
      || !task.leaseExpiresAt
      || new Date(task.leaseExpiresAt).getTime() <= Date.now()
      || normalizedEvidence.taskId !== taskId
      || normalizedEvidence.executorId !== executorId
      || normalizedEvidence.executorSessionId !== task.leaseExecutorSessionId
      || normalizedEvidence.attemptId !== leaseId
      || normalizedEvidence.heartbeatRevision !== task.leaseHeartbeatRevision
      || ![TASK_STATUSES.COMPLETED, TASK_STATUSES.ACTION_REQUIRED, TASK_STATUSES.FAILED].includes(taskStatus)
    ) {
      return null;
    }

    task.status = taskStatus;
    task.summary = summary || "";
    task.result = result || null;
    task.error = error || null;
    task.leasedBy = null;
    task.leaseId = null;
    task.leaseExecutorSessionId = null;
    task.leaseHeartbeatRevision = null;
    task.leaseExpiresAt = null;
    task.updatedAt = nowIso();
    const evidenceKey = [
      normalizedEvidence.executorId,
      normalizedEvidence.platform,
      normalizedEvidence.operation
    ].join(":");
    const existingEvidence = this.connectorProbeEvidence.get(evidenceKey);
    if (!existingEvidence || existingEvidence.checkedAt <= normalizedEvidence.checkedAt) {
      this.connectorProbeEvidence.set(evidenceKey, normalizedEvidence);
    }

    await this.appendAudit({
      taskId,
      actor,
      eventType: taskEventType(taskStatus),
      detail: { status: taskStatus }
    });
    await this.appendAudit({
      taskId,
      actor,
      eventType: "connector.probe_recorded",
      detail: publicProbeAuditDetail(normalizedEvidence)
    });
    return clone(task);
  }

  async retryTask({ taskId, actor, note = "" }) {
    const task = this.tasks.get(taskId);
    if (!task || ![TASK_STATUSES.ACTION_REQUIRED, TASK_STATUSES.FAILED].includes(task.status)) return null;
    task.status = TASK_STATUSES.QUEUED;
    task.error = null;
    task.leasedBy = null;
    task.leaseId = null;
    task.leaseExecutorSessionId = null;
    task.leaseHeartbeatRevision = null;
    task.leaseExpiresAt = null;
    task.updatedAt = nowIso();
    await this.appendAudit({ taskId, actor, eventType: "task.requeued", detail: { note } });
    return clone(task);
  }

  async createApproval({ taskId, type, title, summary, nextStep, requestedBy }) {
    const id = crypto.randomUUID();
    const approval = {
      id,
      taskId,
      type,
      title,
      summary,
      nextStep,
      status: APPROVAL_STATUSES.PENDING,
      requestedBy,
      decidedBy: null,
      decisionNote: "",
      createdAt: nowIso(),
      decidedAt: null,
      expiresAt: null
    };
    this.approvals.set(id, approval);
    return clone(approval);
  }

  async getApproval(id) {
    return clone(this.approvals.get(id));
  }

  async listApprovals({ status } = {}) {
    return [...this.approvals.values()]
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async decideApproval({ taskId, approvalId, approved, actor, note }) {
    const approval = this.approvals.get(approvalId);
    const task = this.tasks.get(taskId);
    if (!approval || !task || approval.taskId !== taskId) return null;
    if (approval.status !== APPROVAL_STATUSES.PENDING) {
      return { task: clone(task), approval: clone(approval), changed: false };
    }

    approval.status = approved ? APPROVAL_STATUSES.APPROVED : APPROVAL_STATUSES.REJECTED;
    approval.decidedBy = actor;
    approval.decisionNote = note || "";
    approval.decidedAt = nowIso();

    if (approved) {
      task.status = TASK_STATUSES.QUEUED;
      task.currentStep = approval.nextStep || "publish";
      task.error = null;
    } else {
      task.status = TASK_STATUSES.CANCELLED;
    }
    task.updatedAt = nowIso();
    await this.appendAudit({
      taskId,
      actor,
      eventType: approved ? "approval.approved" : "approval.rejected",
      detail: { approvalId }
    });
    return { task: clone(task), approval: clone(approval), changed: true };
  }

  async addArtifact({ taskId, kind, title, summary, retentionUntil, location, content }) {
    const id = crypto.randomUUID();
    const artifact = {
      id,
      taskId,
      kind: kind || "summary",
      title: title || "",
      summary: summary || "",
      location: location || "",
      content: content || null,
      retentionUntil: retentionUntil || null,
      createdAt: nowIso()
    };
    this.artifacts.set(id, artifact);
    return clone(artifact);
  }

  async listArtifacts(taskId) {
    return [...this.artifacts.values()]
      .filter((item) => item.taskId === taskId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  async appendAudit({ taskId = null, actor, eventType, detail = {} }) {
    const event = {
      id: crypto.randomUUID(),
      taskId,
      actor: actor || "system",
      eventType,
      detail,
      createdAt: nowIso()
    };
    this.auditEvents.push(event);
    return clone(event);
  }

  async listAuditEvents({ taskId, eventType, limit = 100 } = {}) {
    return this.auditEvents
      .filter((item) => !taskId || item.taskId === taskId)
      .filter((item) => !eventType || item.eventType === eventType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }
}

function taskEventType(status) {
  return {
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
    capability: evidence.capability,
    outcome: evidence.outcome,
    issueCode: evidence.issueCode,
    checkedAt: evidence.checkedAt,
    expiresAt: evidence.expiresAt
  };
}
