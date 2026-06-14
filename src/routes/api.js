import express from "express";
import { describeConnectorRegistry } from "../connectors/contracts.js";
import { requireApiScope } from "../security/auth.js";
import { publicTask, redact } from "../security/redact.js";
import { validateTaskInput } from "../domain/workflow.js";

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
      auditEvents: redact(auditEvents)
    });
  });

  router.post("/tasks/:id/approve", requireApiScope("tasks:approve"), async (req, res) => {
    const approved = req.body?.approved !== false && req.body?.decision !== "reject";
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
    res.json({ task: publicTask(retried) });
  });

  router.post("/executor/lease", requireApiScope("executor:lease"), async (req, res) => {
    const executorId = req.body?.executorId || actorName(req);
    const task = await req.app.locals.store.leaseTask({
      executorId,
      leaseMs: req.app.locals.config.leaseMs
    });
    res.json({ task: publicTask(task) });
  });

  router.post("/executor/tasks/:id/result", requireApiScope("executor:result"), async (req, res) => {
    const body = req.body || {};
    const actor = actorName(req);
    const task = await req.app.locals.store.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task_not_found" });
      return;
    }

    if (body.status === "needs_approval") {
      const outcome = await req.app.locals.store.markTaskNeedsApproval({
        taskId: task.id,
        summary: body.summary || "",
        result: redact(body.result || {}),
        approval: body.approval || {},
        artifacts: redact(body.artifacts || []),
        actor
      });
      await req.app.locals.notifier.approvalRequested(outcome);
      res.json({ task: publicTask(outcome.task), approval: outcome.approval });
      return;
    }

    if (body.status === "completed") {
      const completed = await req.app.locals.store.completeTask({
        taskId: task.id,
        summary: body.summary || "",
        result: redact(body.result || {}),
        artifacts: redact(body.artifacts || []),
        actor
      });
      res.json({ task: publicTask(completed) });
      return;
    }

    if (body.status === "needs_action") {
      const actionRequired = await req.app.locals.store.markTaskNeedsAction({
        taskId: task.id,
        summary: body.summary || "",
        result: redact(body.result || {}),
        error: redact(body.error || { message: "Manual action required" }),
        artifacts: redact(body.artifacts || []),
        actor
      });
      res.json({ task: publicTask(actionRequired) });
      return;
    }

    if (body.status === "failed") {
      const failed = await req.app.locals.store.failTask({
        taskId: task.id,
        error: redact(body.error || { message: "Unknown executor failure" }),
        actor
      });
      res.status(200).json({ task: publicTask(failed) });
      return;
    }

    res.status(400).json({ error: "unsupported_result_status" });
  });

  router.get("/audit", requireApiScope("audit:read"), async (req, res) => {
    const auditEvents = await req.app.locals.store.listAuditEvents({
      taskId: req.query.taskId || undefined,
      limit: Number(req.query.limit || 100)
    });
    res.json({ auditEvents: redact(auditEvents) });
  });

  router.get("/connectors", requireApiScope("connectors:read"), async (req, res) => {
    res.json(describeConnectorRegistry(req.app.locals.connectorRegistry));
  });

  return router;
}
