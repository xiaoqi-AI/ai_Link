import crypto from "node:crypto";
import { APPROVAL_STATUSES, TASK_STATUSES } from "../domain/workflow.js";
import { normalizeConnectorProbeEvidence } from "../connectors/probeEvidence.js";
import { normalizeConfiguredApiTokenSnapshot } from "../security/apiTokenLifecycle.js";
import {
  approvalExpiresAt,
  emptyRetentionCounts,
  normalizeRetentionPolicy,
  normalizeRetentionRequest,
  retentionCutoffs,
  retentionResult,
  TERMINAL_TASK_STATUSES
} from "./retention.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

export class MemoryStore {
  constructor({ retention } = {}) {
    this.tasks = new Map();
    this.approvals = new Map();
    this.artifacts = new Map();
    this.auditEvents = [];
    this.apiTokens = new Map();
    this.executorHeartbeats = new Map();
    this.connectorProbeEvidence = new Map();
    this.retentionPolicy = normalizeRetentionPolicy(retention);
  }

  async init() {}

  async close() {}

  async upsertApiToken(record) {
    const existing = [...this.apiTokens.values()].find((item) => item.name === record.name);
    const hashOwner = this.apiTokens.get(record.tokenHash);
    if (hashOwner && hashOwner.name !== record.name) {
      throw new Error("API token value is already assigned to another name.");
    }
    const sameCredential = existing?.tokenHash === record.tokenHash;
    const next = {
      id: existing?.id || crypto.randomUUID(),
      name: record.name,
      tokenHash: record.tokenHash,
      scopes: record.scopes,
      executorId: record.executorId || "",
      expiresAt: sameCredential ? existing.expiresAt : record.expiresAt || null,
      revokedAt: sameCredential ? existing.revokedAt : null,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    if (existing && existing.tokenHash !== next.tokenHash) {
      this.apiTokens.delete(existing.tokenHash);
    }
    this.apiTokens.set(next.tokenHash, next);
    return clone(next);
  }

  async syncConfiguredApiTokens(snapshot) {
    const { managedNames, activeTokens } = normalizeConfiguredApiTokenSnapshot(snapshot);
    const nextTokens = new Map(
      [...this.apiTokens.entries()].map(([tokenHash, record]) => [tokenHash, clone(record)])
    );
    const activeNames = new Set(activeTokens.map((record) => record.name));
    const managedSet = new Set(managedNames);
    const now = nowIso();
    const summary = { active: activeTokens.length, inserted: 0, rotated: 0, preserved: 0, revoked: 0 };

    for (const record of activeTokens) {
      const conflicting = nextTokens.get(record.tokenHash);
      if (conflicting && conflicting.name !== record.name) {
        throw new Error("Configured API token value is already assigned to another name.");
      }
    }

    for (const record of activeTokens) {
      const sameName = [...nextTokens.values()].filter((item) => item.name === record.name);
      const sameCredential = sameName.find((item) => item.tokenHash === record.tokenHash);
      for (const existing of sameName) nextTokens.delete(existing.tokenHash);

      if (sameCredential) {
        nextTokens.set(record.tokenHash, {
          ...sameCredential,
          scopes: record.scopes,
          executorId: record.executorId,
          updatedAt: now
        });
        summary.preserved += 1;
        continue;
      }

      const previous = sameName
        .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))[0];
      nextTokens.set(record.tokenHash, {
        id: previous?.id || crypto.randomUUID(),
        name: record.name,
        tokenHash: record.tokenHash,
        scopes: record.scopes,
        executorId: record.executorId,
        expiresAt: record.expiresAt,
        revokedAt: null,
        createdAt: previous?.createdAt || now,
        updatedAt: now
      });
      if (previous) summary.rotated += 1;
      else summary.inserted += 1;
    }

    for (const [tokenHash, record] of nextTokens) {
      if (!managedSet.has(record.name) || activeNames.has(record.name) || record.revokedAt) continue;
      nextTokens.set(tokenHash, { ...record, revokedAt: now, updatedAt: now });
      summary.revoked += 1;
    }

    this.apiTokens = nextTokens;
    return summary;
  }

  async findApiTokenByHash(tokenHash) {
    const record = this.apiTokens.get(tokenHash);
    return record ? clone(record) : null;
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
    const key = connectorProbeEvidenceKey(evidence);
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
    const task = this.tasks.get(taskId);
    if (
      !task
      || task.options?.evidenceIntent === "connector_probe"
      || task.status !== TASK_STATUSES.RUNNING
      || task.leasedBy !== executorId
      || task.leaseExecutorSessionId !== executorSessionId
      || task.leaseId !== leaseId
      || !task.leaseExpiresAt
      || new Date(task.leaseExpiresAt).getTime() <= Date.now()
      || ![
        TASK_STATUSES.APPROVAL_REQUIRED,
        TASK_STATUSES.COMPLETED,
        TASK_STATUSES.ACTION_REQUIRED,
        TASK_STATUSES.FAILED
      ].includes(taskStatus)
    ) {
      return null;
    }

    let outcome;
    if (taskStatus === TASK_STATUSES.APPROVAL_REQUIRED) {
      outcome = await this.markTaskNeedsApproval({
        taskId,
        summary,
        result,
        approval,
        artifacts,
        actor
      });
    } else if (taskStatus === TASK_STATUSES.COMPLETED) {
      outcome = {
        task: await this.completeTask({ taskId, summary, result, artifacts, actor }),
        approval: null
      };
    } else if (taskStatus === TASK_STATUSES.ACTION_REQUIRED) {
      outcome = {
        task: await this.markTaskNeedsAction({ taskId, summary, result, error, artifacts, actor }),
        approval: null
      };
    } else {
      outcome = {
        task: await this.failTask({ taskId, error, result, actor }),
        approval: null
      };
    }

    if (aiLinkAudit) {
      await this.appendAudit({
        taskId,
        actor,
        eventType: "ai_link.audit",
        detail: { status: resultStatus, audit: aiLinkAudit }
      });
    }
    return outcome;
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
    const evidenceKey = connectorProbeEvidenceKey(normalizedEvidence);
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
    const createdAt = nowIso();
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
      createdAt,
      decidedAt: null,
      expiresAt: approvalExpiresAt(createdAt, this.retentionPolicy)
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
      return {
        task: clone(task),
        approval: clone(approval),
        changed: false,
        reason: approval.status === APPROVAL_STATUSES.EXPIRED ? "approval_expired" : "approval_already_decided"
      };
    }
    if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= Date.now()) {
      approval.status = APPROVAL_STATUSES.EXPIRED;
      approval.decidedBy = actor;
      approval.decisionNote = "Expired before decision.";
      approval.decidedAt = nowIso();
      if (task.status === TASK_STATUSES.APPROVAL_REQUIRED) {
        task.status = TASK_STATUSES.ACTION_REQUIRED;
        task.error = { code: "approval_expired" };
        task.updatedAt = nowIso();
      }
      await this.appendAudit({
        taskId,
        actor,
        eventType: "approval.expired",
        detail: { approvalId }
      });
      return {
        task: clone(task),
        approval: clone(approval),
        changed: false,
        reason: "approval_expired"
      };
    }
    if (task.status !== TASK_STATUSES.APPROVAL_REQUIRED) {
      return {
        task: clone(task),
        approval: clone(approval),
        changed: false,
        reason: "approval_context_stale"
      };
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

  async runRetentionMaintenance(options = {}) {
    const request = normalizeRetentionRequest({
      ...options,
      policy: { ...this.retentionPolicy, ...(options.policy || {}) }
    });
    const cutoffs = retentionCutoffs(request.asOf, request.policy);
    const selected = collectMemoryRetentionCandidates(this, request, cutoffs);
    const candidates = retentionCounts(selected);
    const hasMore = Object.values(selected).some((records) => records.hasMore);
    if (!request.apply) {
      return retentionResult({
        request,
        candidates,
        changed: emptyRetentionCounts(),
        hasMore,
        cutoffs
      });
    }

    const nextTasks = cloneMap(this.tasks);
    const nextApprovals = cloneMap(this.approvals);
    const nextArtifacts = cloneMap(this.artifacts);
    const nextHeartbeats = cloneMap(this.executorHeartbeats);
    const nextProbes = cloneMap(this.connectorProbeEvidence);
    const deletedAuditIds = new Set(selected.auditEvents.records.map((record) => record.id));
    const nextAuditEvents = this.auditEvents
      .filter((record) => !deletedAuditIds.has(record.id))
      .map(clone);

    for (const record of selected.approvals.records) {
      const approval = nextApprovals.get(record.id);
      if (!approval || approval.status !== APPROVAL_STATUSES.PENDING) continue;
      approval.status = APPROVAL_STATUSES.EXPIRED;
      approval.decidedBy = request.actor;
      approval.decisionNote = "Expired by retention policy.";
      approval.decidedAt = request.asOf;
      const task = nextTasks.get(approval.taskId);
      if (task?.status === TASK_STATUSES.APPROVAL_REQUIRED) {
        task.status = TASK_STATUSES.ACTION_REQUIRED;
        task.error = { code: "approval_expired" };
        task.updatedAt = request.asOf;
      }
      nextAuditEvents.push({
        id: crypto.randomUUID(),
        taskId: approval.taskId,
        actor: request.actor,
        eventType: "approval.expired",
        detail: { approvalId: approval.id },
        createdAt: request.asOf
      });
    }
    for (const record of selected.artifacts.records) nextArtifacts.delete(record.id);
    for (const record of selected.executorHeartbeats.records) nextHeartbeats.delete(record.executorId);
    for (const record of selected.connectorProbes.records) nextProbes.delete(record.key);

    const changed = { ...candidates };
    nextAuditEvents.push({
      id: request.runId,
      taskId: null,
      actor: request.actor,
      eventType: "maintenance.retention_applied",
      detail: { policyVersion: "1", changed, cutoffs, hasMore },
      createdAt: request.asOf
    });

    this.tasks = nextTasks;
    this.approvals = nextApprovals;
    this.artifacts = nextArtifacts;
    this.executorHeartbeats = nextHeartbeats;
    this.connectorProbeEvidence = nextProbes;
    this.auditEvents = nextAuditEvents;
    return retentionResult({ request, candidates, changed, hasMore, cutoffs });
  }
}

function collectMemoryRetentionCandidates(store, request, cutoffs) {
  const limit = request.policy.maxRowsPerTable;
  const terminal = new Set(TERMINAL_TASK_STATUSES);
  const approvals = [...store.approvals.values()]
    .filter((record) => record.status === APPROVAL_STATUSES.PENDING)
    .filter((record) => (record.expiresAt || record.createdAt) <= (record.expiresAt ? request.asOf : cutoffs.approval))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const artifacts = [...store.artifacts.values()]
    .filter((record) => {
      const task = store.tasks.get(record.taskId);
      if (!task || !terminal.has(task.status)) return false;
      return record.retentionUntil
        ? record.retentionUntil <= request.asOf
        : record.createdAt <= cutoffs.artifact;
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const executorHeartbeats = [...store.executorHeartbeats.values()]
    .filter((record) => record.expiresAt <= cutoffs.heartbeat)
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
  const connectorProbes = [...store.connectorProbeEvidence.entries()]
    .map(([key, record]) => ({ key, ...record }))
    .filter((record) => record.expiresAt <= cutoffs.probe)
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
  const auditEvents = store.auditEvents
    .filter((record) => {
      const cutoff = record.eventType.startsWith("maintenance.") ? cutoffs.maintenanceAudit : cutoffs.audit;
      if (record.createdAt > cutoff) return false;
      if (!record.taskId) return true;
      const task = store.tasks.get(record.taskId);
      return Boolean(task && terminal.has(task.status));
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return {
    approvals: boundedSelection(approvals, limit),
    artifacts: boundedSelection(artifacts, limit),
    executorHeartbeats: boundedSelection(executorHeartbeats, limit),
    connectorProbes: boundedSelection(connectorProbes, limit),
    auditEvents: boundedSelection(auditEvents, limit)
  };
}

function boundedSelection(records, limit) {
  return { records: records.slice(0, limit), hasMore: records.length > limit };
}

function retentionCounts(selected) {
  return Object.fromEntries(
    Object.entries(selected).map(([name, selection]) => [name, selection.records.length])
  );
}

function cloneMap(map) {
  return new Map([...map.entries()].map(([key, value]) => [key, clone(value)]));
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

function connectorProbeEvidenceKey(evidence) {
  return [
    evidence.executorId,
    evidence.platform,
    evidence.operation,
    evidence.qualifier,
    evidence.subjectKey
  ].join(":");
}
