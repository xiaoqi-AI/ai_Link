import express from "express";
import { describeConnectorRegistry } from "../connectors/contracts.js";
import { createSessionCookie, clearSessionCookie } from "../security/session.js";
import { requireAppSession } from "../security/auth.js";
import { publicAuditEvent, publicTask, redact } from "../security/redact.js";
import { connectorsPage, dashboardPage, loginPage, newTaskPage, taskPage } from "../ui/html.js";
import { validateTaskInput } from "../domain/workflow.js";

export function createUiRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.redirect("/dashboard");
  });

  router.get("/login", (req, res) => {
    res.send(loginPage({ next: req.query.next || "/dashboard" }));
  });

  router.post("/login", (req, res) => {
    if (req.body?.password !== req.app.locals.config.appPassword) {
      res.status(401).send(loginPage({ error: "密码不正确", next: req.body?.next || "/dashboard" }));
      return;
    }
    res.setHeader("Set-Cookie", createSessionCookie({
      actor: "console",
      secret: req.app.locals.config.sessionSecret,
      secure: req.app.locals.config.isProduction
    }));
    res.redirect(req.body?.next || "/dashboard");
  });

  router.get("/logout", (req, res) => {
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.redirect("/login");
  });

  router.get("/dashboard", requireAppSession, async (req, res) => {
    const [tasks, actionTasks, approvals] = await Promise.all([
      req.app.locals.store.listTasks({ limit: 50 }),
      req.app.locals.store.listTasks({ status: "action_required", limit: 20 }),
      req.app.locals.store.listApprovals({ status: "pending" })
    ]);
    const { connectors } = describeConnectorRegistry(req.app.locals.connectorRegistry);
    res.send(dashboardPage({
      tasks: tasks.map(publicTask),
      actionTasks: actionTasks.map(publicTask),
      approvals,
      connectors
    }));
  });

  router.get("/dashboard/new", requireAppSession, (req, res) => {
    res.send(newTaskPage());
  });

  router.get("/dashboard/connectors", requireAppSession, (req, res) => {
    res.send(connectorsPage(describeConnectorRegistry(req.app.locals.connectorRegistry)));
  });

  router.post("/dashboard/tasks", requireAppSession, async (req, res) => {
    const parsed = validateTaskInput({
      workflow: req.body.workflow,
      input: {
        url: req.body.url,
        title: req.body.title,
        text: req.body.text
      },
      targets: ["wechat_official", "zhuque_ai"],
      options: {}
    });
    if (parsed.error) {
      res.status(400).send(newTaskPage());
      return;
    }
    const task = await req.app.locals.store.createTask({
      workflow: parsed.workflow,
      input: parsed.input,
      targets: parsed.targets,
      options: parsed.options,
      createdBy: "console"
    });
    res.redirect(`/dashboard/tasks/${task.id}`);
  });

  router.get("/dashboard/tasks/:id", requireAppSession, async (req, res) => {
    const task = await req.app.locals.store.getTask(req.params.id);
    if (!task) {
      res.status(404).send("Task not found");
      return;
    }
    const [approvals, artifacts, auditEvents] = await Promise.all([
      req.app.locals.store.listApprovals({}),
      req.app.locals.store.listArtifacts(task.id),
      req.app.locals.store.listAuditEvents({ taskId: task.id })
    ]);
    res.send(taskPage({
      task: publicTask(task),
      approvals: approvals.filter((item) => item.taskId === task.id),
      artifacts: redact(artifacts),
      auditEvents: auditEvents.map(publicAuditEvent)
    }));
  });

  router.post("/dashboard/tasks/:id/approve", requireAppSession, async (req, res) => {
    const approved = req.body?.decision === "approve";
    await req.app.locals.store.decideApproval({
      taskId: req.params.id,
      approvalId: req.body?.approvalId,
      approved,
      actor: "console",
      note: req.body?.note || ""
    });
    res.redirect(`/dashboard/tasks/${req.params.id}`);
  });

  router.post("/dashboard/tasks/:id/retry", requireAppSession, async (req, res) => {
    await req.app.locals.store.retryTask({
      taskId: req.params.id,
      actor: "console",
      note: req.body?.note || ""
    });
    res.redirect(`/dashboard/tasks/${req.params.id}`);
  });

  return router;
}
