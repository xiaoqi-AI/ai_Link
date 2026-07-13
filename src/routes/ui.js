import express from "express";
import { summarizeConnectorAuthStatus } from "../connectors/authStatus.js";
import { describeConnectorRuntime } from "../connectors/executorCapabilities.js";
import { createSessionCookie, clearSessionCookie } from "../security/session.js";
import { requireAppSession } from "../security/auth.js";
import { clearCsrfCookie, issueCsrfToken, requireCsrfToken } from "../security/csrf.js";
import { browserSessionActor, loginRateLimitKey, secureSecretEqual } from "../security/loginRateLimit.js";
import { publicAuditEvent, publicTask, redact } from "../security/redact.js";
import { auditPage, connectorsPage, dashboardPage, loginPage, newTaskPage, taskPage } from "../ui/html.js";
import { validateTaskInput } from "../domain/workflow.js";

const AUTH_STATUS_ACTION_LIMIT = 50;
const DASHBOARD_ACTION_LIMIT = 20;

export function createUiRouter() {
  const router = express.Router();
  const requireAuthenticatedCsrf = requireCsrfToken({ authenticated: true });
  const requirePreauthCsrf = requireCsrfToken();

  router.use((req, res, next) => {
    if (req.cloudflareAccess?.serviceToken) {
      res.status(403).send("Service identities cannot use the browser console.");
      return;
    }
    next();
  });

  router.get("/", (req, res) => {
    res.redirect("/dashboard");
  });

  router.get("/login", (req, res) => {
    res.send(loginPage({
      next: safeNextPath(req.query.next),
      csrfToken: issuePageCsrf(req, res)
    }));
  });

  router.post("/login", requirePreauthCsrf, (req, res) => {
    const next = safeNextPath(req.body?.next);
    const rateLimitKey = loginRateLimitKey(req, req.app.locals.config.sessionSecret);
    const rateState = req.app.locals.loginRateLimiter.check(rateLimitKey);
    if (!rateState.allowed) {
      res.setHeader("Retry-After", String(rateState.retryAfterSeconds));
      res.status(429).send(loginPage({
        error: "登录尝试过多，请稍后再试",
        next,
        csrfToken: issuePageCsrf(req, res)
      }));
      return;
    }

    if (!secureSecretEqual(req.body?.password, req.app.locals.config.appPassword)) {
      req.app.locals.loginRateLimiter.recordFailure(rateLimitKey);
      res.status(401).send(loginPage({
        error: "密码不正确",
        next,
        csrfToken: issuePageCsrf(req, res)
      }));
      return;
    }

    req.app.locals.loginRateLimiter.reset(rateLimitKey);
    res.append("Set-Cookie", createSessionCookie({
      actor: browserSessionActor(req, req.app.locals.config.sessionSecret),
      secret: req.app.locals.config.sessionSecret,
      secure: req.app.locals.config.isProduction,
      maxAgeSeconds: req.app.locals.config.sessionMaxAgeSeconds
    }));
    res.redirect(303, next);
  });

  router.post("/logout", requireAppSession, requireAuthenticatedCsrf, (req, res) => {
    res.append("Set-Cookie", clearSessionCookie({ secure: req.app.locals.config.isProduction }));
    res.append("Set-Cookie", clearCsrfCookie({ secure: req.app.locals.config.isProduction }));
    res.redirect(303, "/login");
  });

  router.get("/dashboard", requireAppSession, async (req, res) => {
    const [tasks, actionTasks, approvalTasks, approvals, heartbeats, probes] = await Promise.all([
      req.app.locals.store.listTasks({ limit: 50 }),
      req.app.locals.store.listTasks({ status: "action_required", limit: AUTH_STATUS_ACTION_LIMIT + 1 }),
      req.app.locals.store.listTasks({ status: "approval_required", limit: AUTH_STATUS_ACTION_LIMIT + 1 }),
      req.app.locals.store.listApprovals({ status: "pending" }),
      req.app.locals.store.listExecutorHeartbeats({ limit: 50 }),
      req.app.locals.store.listConnectorProbeEvidence({ limit: 100 })
    ]);
    const connectorDescription = describeConnectorRuntime({
      registry: req.app.locals.connectorRegistry,
      heartbeats,
      probes
    });
    const { connectors } = connectorDescription;
    const actionTasksTruncated = actionTasks.length > AUTH_STATUS_ACTION_LIMIT
      || approvalTasks.length > AUTH_STATUS_ACTION_LIMIT;
    const authStatus = summarizeConnectorAuthStatus({
      connectors: connectorDescription.executorRuntime.connectors,
      actionTasks: [
        ...actionTasks.slice(0, AUTH_STATUS_ACTION_LIMIT),
        ...approvalTasks.slice(0, AUTH_STATUS_ACTION_LIMIT)
      ].map(publicTask),
      actionTasksTruncated
    });
    res.send(dashboardPage({
      tasks: tasks.map(publicTask),
      actionTasks: actionTasks.slice(0, DASHBOARD_ACTION_LIMIT).map(publicTask),
      approvals,
      connectors,
      executorRuntime: connectorDescription.executorRuntime,
      authStatus,
      csrfToken: issueAuthenticatedPageCsrf(req, res)
    }));
  });

  router.get("/dashboard/new", requireAppSession, (req, res) => {
    res.send(newTaskPage({ csrfToken: issueAuthenticatedPageCsrf(req, res) }));
  });

  router.get("/dashboard/connectors", requireAppSession, async (req, res) => {
    const [heartbeats, probes, actionTasks, approvalTasks] = await Promise.all([
      req.app.locals.store.listExecutorHeartbeats({ limit: 50 }),
      req.app.locals.store.listConnectorProbeEvidence({ limit: 100 }),
      req.app.locals.store.listTasks({ status: "action_required", limit: AUTH_STATUS_ACTION_LIMIT + 1 }),
      req.app.locals.store.listTasks({ status: "approval_required", limit: AUTH_STATUS_ACTION_LIMIT + 1 })
    ]);
    const connectorDescription = describeConnectorRuntime({
      registry: req.app.locals.connectorRegistry,
      heartbeats,
      probes
    });
    const actionTasksTruncated = actionTasks.length > AUTH_STATUS_ACTION_LIMIT
      || approvalTasks.length > AUTH_STATUS_ACTION_LIMIT;
    res.send(connectorsPage({
      ...connectorDescription,
      authStatus: summarizeConnectorAuthStatus({
        connectors: connectorDescription.executorRuntime.connectors,
        actionTasks: [
          ...actionTasks.slice(0, AUTH_STATUS_ACTION_LIMIT),
          ...approvalTasks.slice(0, AUTH_STATUS_ACTION_LIMIT)
        ].map(publicTask),
        actionTasksTruncated
      }),
      csrfToken: issueAuthenticatedPageCsrf(req, res)
    }));
  });

  router.get("/dashboard/audit", requireAppSession, async (req, res) => {
    const limit = boundedLimit(req.query.limit, 100, 200);
    const filters = {
      taskId: req.query.taskId || "",
      eventType: req.query.eventType || "",
      limit
    };
    const auditEvents = await req.app.locals.store.listAuditEvents({
      taskId: filters.taskId || undefined,
      eventType: filters.eventType || undefined,
      limit
    });
    res.send(auditPage({
      auditEvents: auditEvents.map(publicAuditEvent),
      filters,
      csrfToken: issueAuthenticatedPageCsrf(req, res)
    }));
  });

  router.post("/dashboard/tasks", requireAppSession, requireAuthenticatedCsrf, async (req, res) => {
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
      res.status(400).send(newTaskPage({ csrfToken: issueAuthenticatedPageCsrf(req, res) }));
      return;
    }
    const task = await req.app.locals.store.createTask({
      workflow: parsed.workflow,
      input: parsed.input,
      targets: parsed.targets,
      options: parsed.options,
      createdBy: req.actor.name
    });
    res.redirect(303, `/dashboard/tasks/${task.id}`);
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
      auditEvents: auditEvents.map(publicAuditEvent),
      csrfToken: issueAuthenticatedPageCsrf(req, res)
    }));
  });

  router.post("/dashboard/tasks/:id/approve", requireAppSession, requireAuthenticatedCsrf, async (req, res) => {
    if (!["approve", "reject"].includes(req.body?.decision)) {
      res.status(400).send("Invalid approval decision.");
      return;
    }
    const approved = req.body?.decision === "approve";
    const decision = await req.app.locals.store.decideApproval({
      taskId: req.params.id,
      approvalId: req.body?.approvalId,
      approved,
      actor: req.actor.name,
      note: req.body?.note || ""
    });
    if (!decision) {
      res.status(404).send("Approval not found.");
      return;
    }
    if (!decision.changed) {
      const message = {
        approval_expired: "Approval expired.",
        approval_context_stale: "Approval no longer matches the task state."
      }[decision.reason] || "Approval already decided.";
      res.status(409).send(message);
      return;
    }
    res.redirect(303, `/dashboard/tasks/${req.params.id}`);
  });

  router.post("/dashboard/tasks/:id/retry", requireAppSession, requireAuthenticatedCsrf, async (req, res) => {
    const task = await req.app.locals.store.retryTask({
      taskId: req.params.id,
      actor: req.actor.name,
      note: req.body?.note || ""
    });
    if (!task) {
      res.status(409).send("Task cannot be retried from its current state.");
      return;
    }
    res.redirect(303, `/dashboard/tasks/${req.params.id}`);
  });

  return router;
}

function issuePageCsrf(req, res) {
  const config = req.app.locals.config;
  return issueCsrfToken(req, res, {
    secret: config.sessionSecret,
    secure: config.isProduction,
    maxAgeSeconds: config.sessionMaxAgeSeconds,
    tokenTtlSeconds: config.csrfTokenTtlSeconds,
    now: req.app.locals.clock()
  });
}

function issueAuthenticatedPageCsrf(req, res) {
  const config = req.app.locals.config;
  return issueCsrfToken(req, res, {
    secret: config.sessionSecret,
    secure: config.isProduction,
    sessionCookie: req.appSessionCookie,
    maxAgeSeconds: config.sessionMaxAgeSeconds,
    tokenTtlSeconds: config.csrfTokenTtlSeconds,
    now: req.app.locals.clock()
  });
}

function safeNextPath(value) {
  const next = String(value || "");
  if (
    next === "/dashboard"
    || next.startsWith("/dashboard/")
    || next.startsWith("/dashboard?")
  ) {
    if (!next.includes("\\") && !/[\u0000-\u001f\u007f]/.test(next)) return next;
  }
  return "/dashboard";
}

function boundedLimit(value, fallback, max) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}
