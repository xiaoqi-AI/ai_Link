import express from "express";
import { attachAiLinkAudit, extractAiLinkAudit } from "../audit/aiLinkAudit.js";
import { summarizeConnectorAuthStatus } from "../connectors/authStatus.js";
import {
  describeConnectorRuntime,
  normalizeExecutorCapabilityHeartbeat,
  normalizeTargetVerificationRequest,
  verifyConnectorTargetRequirements
} from "../connectors/executorCapabilities.js";
import {
  buildConnectorProbeSettlement,
  eligibleConnectorProbeKeys,
  isConnectorProbeTask
} from "../connectors/probeEvidence.js";
import { requireApiScope } from "../security/auth.js";
import { publicAuditEvent, publicLeasedTask, publicTask, redact } from "../security/redact.js";
import { validateTaskInput } from "../domain/workflow.js";

const AUTH_STATUS_ACTION_LIMIT = 50;

function actorName(req) {
  return req.actor?.name || "unknown";
}

export function createApiRouter() {
  const router = express.Router();

  router.post("/tasks", requireApiScope("tasks:create"), async (req, res) => {
    const parsed = validateTaskInput(req.body || {});
    if (parsed.error) {
      res.status(400).json(parsed);
      return;
    }
    if (
      parsed.options?.evidenceIntent === "connector_probe"
      && !req.actor?.scopes?.includes("tasks:approve")
    ) {
      res.status(403).json({ error: "connector_probe_approval_required" });
      return;
    }
    const task = await req.app.locals.store.createTask({
      workflow: parsed.workflow,
      input: parsed.input,
      targets: parsed.targets,
      options: parsed.options,
      createdBy: actorName(req)
    });
    res.status(201).json({ task: publicTask(task) });
  });

  router.get("/tasks", requireApiScope("tasks:read"), async (req, res) => {
    const tasks = await req.app.locals.store.listTasks({
      limit: Number(req.query.limit || 50),
      status: req.query.status || ""
    });
    res.json({ tasks: tasks.map(publicTask) });
  });

  router.get("/tasks/:id", requireApiScope("tasks:read"), async (req, res) => {
    const task = await req.app.locals.store.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task_not_found" });
      return;
    }
    const [approvals, artifacts, auditEvents] = await Promise.all([
      req.app.locals.store.listApprovals({}),
      req.app.locals.store.listArtifacts(task.id),
      req.app.locals.store.listAuditEvents({ taskId: task.id })
    ]);
    res.json({
      task: publicTask(task),
      approvals: approvals.filter((item) => item.taskId === task.id),
      artifacts: redact(artifacts),
      auditEvents: auditEvents.map(publicAuditEvent)
    });
  });

  router.post("/tasks/:id/approve", requireApiScope("tasks:approve"), async (req, res) => {
    const approvedFlag = req.body?.approved;
    const decisionValue = req.body?.decision;
    const hasApprovedFlag = typeof approvedFlag === "boolean";
    const hasDecisionValue = decisionValue === "approve" || decisionValue === "reject";
    if (!hasApprovedFlag && !hasDecisionValue) {
      res.status(400).json({ error: "missing_approval_decision" });
      return;
    }
    if (hasApprovedFlag && hasDecisionValue && approvedFlag !== (decisionValue === "approve")) {
      res.status(400).json({ error: "conflicting_approval_decision" });
      return;
    }
    const approved = hasApprovedFlag ? approvedFlag : decisionValue === "approve";
    const approvalId = req.body?.approvalId;
    if (!approvalId) {
      res.status(400).json({ error: "missing_approval_id" });
      return;
    }
    const decision = await req.app.locals.store.decideApproval({
      taskId: req.params.id,
      approvalId,
      approved,
      actor: actorName(req),
      note: req.body?.note || ""
    });
    if (!decision) {
      res.status(404).json({ error: "approval_not_found" });
      return;
    }
    if (!decision.changed) {
      res.status(409).json({ error: decision.reason || "approval_already_decided" });
      return;
    }
    res.json({ task: publicTask(decision.task), approval: decision.approval });
  });

  router.post("/tasks/:id/retry", requireApiScope("tasks:approve"), async (req, res) => {
    const task = await req.app.locals.store.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task_not_found" });
      return;
    }
    const retried = await req.app.locals.store.retryTask({
      taskId: task.id,
      actor: actorName(req),
      note: req.body?.note || ""
    });
    if (!retried) {
      res.status(409).json({ error: "task_not_retryable" });
      return;
    }
    res.json({ task: publicTask(retried) });
  });

  router.post("/tasks/:id/audit", requireApiScope("audit:write"), async (req, res) => {
    const task = await req.app.locals.store.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task_not_found" });
      return;
    }

    const aiLinkAudit = extractAiLinkAudit(req.body || {});
    if (!aiLinkAudit) {
      res.status(400).json({ error: "missing_ai_link_audit" });
      return;
    }

    const auditEvent = await req.app.locals.store.appendAudit({
      taskId: task.id,
      actor: actorName(req),
      eventType: "ai_link.audit",
      detail: {
        status: req.body?.status || "submitted",
        recordId: req.body?.recordId || "",
        source: req.body?.source || "ai-link-cli",
        audit: aiLinkAudit
      }
    });
    res.status(201).json({ task: publicTask(task), auditEvent: publicAuditEvent(auditEvent) });
  });

  router.post("/executor/lease", requireApiScope("executor:lease"), async (req, res) => {
    const claimedExecutorId = req.body?.executorId || actorName(req);
    if (req.actor?.executorId && req.actor.executorId !== claimedExecutorId) {
      res.status(403).json({ error: "executor_id_mismatch" });
      return;
    }
    const executorId = req.actor?.executorId || claimedExecutorId;
    const executorSessionId = String(req.body?.executorSessionId || "");
    const heartbeats = await req.app.locals.store.listExecutorHeartbeats({ limit: 50 });
    const currentHeartbeat = heartbeats.find((item) => item.executorId === executorId);
    const heartbeat = heartbeats.find((item) =>
      item.executorId === executorId
      && item.executorSessionId === executorSessionId
      && item.trusted === true
    );
    if (
      req.actor?.executorId
      && currentHeartbeat
      && new Date(currentHeartbeat.expiresAt).getTime() > Date.now()
      && !heartbeat
    ) {
      res.status(409).json({ error: "executor_session_not_active" });
      return;
    }
    const task = await req.app.locals.store.leaseTask({
      executorId,
      executorSessionId,
      leaseMs: req.app.locals.config.leaseMs,
      connectorProbeKeys: eligibleConnectorProbeKeys({ heartbeat }),
      heartbeatRevision: heartbeat?.revision || ""
    });
    res.json({ task: publicLeasedTask(task) });
  });

  router.post("/executor/heartbeat", requireApiScope("executor:heartbeat"), async (req, res) => {
    const parsed = normalizeExecutorCapabilityHeartbeat(req.body || {});
    if (parsed.error) {
      res.status(400).json(parsed);
      return;
    }
    if (req.actor?.executorId && req.actor.executorId !== parsed.value.executorId) {
      res.status(403).json({ error: "executor_id_mismatch" });
      return;
    }
    if (!req.actor?.executorId) {
      const existingHeartbeats = await req.app.locals.store.listExecutorHeartbeats({ limit: 50 });
      if (existingHeartbeats.some((item) => item.executorId === parsed.value.executorId && item.trusted === true)) {
        res.status(403).json({ error: "executor_identity_reserved" });
        return;
      }
    }

    const heartbeat = await req.app.locals.store.upsertExecutorHeartbeat({
      ...parsed.value,
      actor: actorName(req),
      trusted: Boolean(
        req.actor?.executorId
        && req.actor.executorId === parsed.value.executorId
        && parsed.value.executorSessionId
      ),
      ttlMs: req.app.locals.config.executorHeartbeatTtlMs
    });
    res.json({
      accepted: true,
      executorId: heartbeat.executorId,
      trusted: heartbeat.trusted === true,
      lastSeenAt: heartbeat.lastSeenAt,
      expiresAt: heartbeat.expiresAt
    });
  });

  router.post("/executor/tasks/:id/result", requireApiScope("executor:result"), async (req, res) => {
    const body = req.body || {};
    const actor = actorName(req);
    const aiLinkAudit = extractAiLinkAudit(body);
    const task = await req.app.locals.store.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task_not_found" });
      return;
    }

    if (isConnectorProbeTask(task)) {
      const settlement = buildConnectorProbeSettlement({
        task,
        envelope: body,
        producerExecutorId: req.actor?.executorId || "",
        subjectSecret: req.app.locals.config.sessionSecret,
        ttlMs: req.app.locals.config.connectorProbeTtlMs
      });
      if (!settlement) {
        res.status(409).json({ error: "connector_probe_binding_mismatch" });
        return;
      }
      const settled = await req.app.locals.store.settleConnectorProbeTask({
        taskId: task.id,
        executorId: req.actor.executorId,
        leaseId: body.leaseId,
        taskStatus: settlement.taskStatus,
        summary: settlement.summary,
        result: settlement.result,
        error: settlement.error,
        actor,
        evidence: settlement.evidence
      });
      if (!settled) {
        res.status(409).json({ error: "connector_probe_attempt_stale" });
        return;
      }
      res.json({ task: publicTask(settled), evidenceAccepted: true });
      return;
    }

    const taskStatus = executorResultTaskStatus(body.status);
    if (!taskStatus) {
      res.status(400).json({ error: "unsupported_result_status" });
      return;
    }

    const executorId = String(body.executorId || "");
    const executorSessionId = String(body.executorSessionId || "");
    const leaseId = String(body.leaseId || "");
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(executorId)
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(executorSessionId)
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(leaseId)
    ) {
      res.status(409).json({ error: "executor_result_binding_mismatch" });
      return;
    }
    if (req.actor?.executorId && req.actor.executorId !== executorId) {
      res.status(403).json({ error: "executor_id_mismatch" });
      return;
    }

    const outcome = await req.app.locals.store.settleTaskResult({
      taskId: task.id,
      executorId,
      executorSessionId,
      leaseId,
      taskStatus,
      resultStatus: body.status,
      summary: body.summary || "",
      result: sanitizedExecutorResult(body, aiLinkAudit),
      error: taskStatus === "action_required"
        ? redact(body.error || { message: "Manual action required" })
        : taskStatus === "failed"
          ? redact(body.error || { message: "Unknown executor failure" })
          : null,
      approval: body.approval || {},
      artifacts: redact(body.artifacts || []),
      actor,
      aiLinkAudit
    });
    if (!outcome) {
      res.status(409).json({ error: "executor_result_attempt_stale" });
      return;
    }
    if (outcome.approval) {
      await req.app.locals.notifier.approvalRequested(outcome);
    }
    res.json({
      task: publicTask(outcome.task),
      ...(outcome.approval ? { approval: outcome.approval } : {})
    });
  });

  router.get("/audit", requireApiScope("audit:read"), async (req, res) => {
    const auditEvents = await req.app.locals.store.listAuditEvents({
      taskId: req.query.taskId || undefined,
      eventType: req.query.eventType || req.query.type || undefined,
      limit: Number(req.query.limit || 100)
    });
    res.json({ auditEvents: auditEvents.map(publicAuditEvent) });
  });

  router.get("/connectors", requireApiScope("connectors:read"), async (req, res) => {
    res.json(await runtimeConnectorDescription(req));
  });

  router.get("/auth-status", requireApiScope("connectors:read"), async (req, res) => {
    const [connectorDescription, actionTasks, approvalTasks] = await Promise.all([
      runtimeConnectorDescription(req),
      req.app.locals.store.listTasks({ status: "action_required", limit: AUTH_STATUS_ACTION_LIMIT + 1 }),
      req.app.locals.store.listTasks({ status: "approval_required", limit: AUTH_STATUS_ACTION_LIMIT + 1 })
    ]);
    const actionTasksTruncated = actionTasks.length > AUTH_STATUS_ACTION_LIMIT
      || approvalTasks.length > AUTH_STATUS_ACTION_LIMIT;
    res.json({
      ...connectorDescription,
      authStatus: summarizeConnectorAuthStatus({
        connectors: connectorDescription.executorRuntime.connectors,
        actionTasks: [
          ...actionTasks.slice(0, AUTH_STATUS_ACTION_LIMIT),
          ...approvalTasks.slice(0, AUTH_STATUS_ACTION_LIMIT)
        ].map(publicTask),
        actionTasksTruncated
      })
    });
  });

  router.post(
    "/auth-status/verify-targets",
    requireApiScope("connectors:read"),
    requireApiScope("connectors:verify-target"),
    async (req, res) => {
      const parsed = normalizeTargetVerificationRequest(req.body || {});
      if (parsed.error) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const [heartbeats, probes] = await Promise.all([
        req.app.locals.store.listExecutorHeartbeats({ limit: 50 }),
        req.app.locals.store.listConnectorProbeEvidence({ limit: 100 })
      ]);
      res.set("cache-control", "no-store");
      res.json({
        targetVerification: verifyConnectorTargetRequirements({
          registry: req.app.locals.connectorRegistry,
          heartbeats,
          probes,
          subjectSecret: req.app.locals.config.sessionSecret,
          requirements: parsed.value.requirements
        })
      });
    }
  );

  return router;
}

async function runtimeConnectorDescription(req) {
  const [heartbeats, probes] = await Promise.all([
    req.app.locals.store.listExecutorHeartbeats({ limit: 50 }),
    req.app.locals.store.listConnectorProbeEvidence({ limit: 100 })
  ]);
  return describeConnectorRuntime({
    registry: req.app.locals.connectorRegistry,
    heartbeats,
    probes
  });
}

function sanitizedExecutorResult(body, aiLinkAudit) {
  return attachAiLinkAudit(redact(withoutInlineAiLinkAudit(body.result || {})), aiLinkAudit);
}

function executorResultTaskStatus(status) {
  return {
    needs_approval: "approval_required",
    completed: "completed",
    needs_action: "action_required",
    failed: "failed"
  }[status] || "";
}

function withoutInlineAiLinkAudit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const { audit, aiLinkAudit, ...rest } = value;
  return rest;
}
