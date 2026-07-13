import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { describeConnectorRegistry } from "../src/connectors/contracts.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import { MemoryStore } from "../src/storage/memoryStore.js";
import { runTask } from "../src/executor/runTask.js";
import { redact } from "../src/security/redact.js";

async function startTestServer() {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_LINK_APP_PASSWORD: "test-password",
    AI_LINK_SESSION_SECRET: "test-session-secret",
    AI_LINK_ADMIN_TOKEN: "admin-token",
    AI_LINK_EXECUTOR_TOKEN: "executor-token",
    AI_LINK_CODEX_TOKEN: "codex-token"
  });
  const notifications = [];
  const { app, store } = await createApp({
    config,
    store: new MemoryStore(),
    notifier: {
      approvalRequested: async ({ task, approval }) => {
        notifications.push({ taskId: task.id, approvalId: approval.id });
      }
    }
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  return {
    store,
    notifications,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function requestJson(baseUrl, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function leaseNextTask(server, executorId = "test-executor", executorSessionId = "test-session") {
  const leased = await requestJson(server.baseUrl, "/api/executor/lease", {
    token: "executor-token",
    method: "POST",
    body: { executorId, executorSessionId }
  });
  if (leased.data.task) {
    Object.defineProperties(leased.data.task, {
      testExecutorId: { value: executorId },
      testExecutorSessionId: { value: executorSessionId }
    });
  }
  return leased;
}

function boundExecutorResult(task, result) {
  return {
    ...result,
    executorId: task.testExecutorId,
    executorSessionId: task.testExecutorSessionId,
    leaseId: task.leaseId
  };
}

describe("AI Link task flow", () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it("runs a full mock chain with publish approval", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "full_chain",
        input: {
          url: "https://mp.weixin.qq.com/s/example",
          title: "测试文章",
          text: "这是一段用于模拟取材、检测和草稿创建的公开测试文本。"
        }
      }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.task.status, "queued");

    const leased = await leaseNextTask(server);
    assert.equal(leased.response.status, 200);
    assert.equal(leased.data.task.status, "running");

    const firstResult = await runTask(leased.data.task);
    assert.equal(firstResult.status, "needs_approval");
    const needsApproval = await requestJson(server.baseUrl, `/api/executor/tasks/${leased.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, firstResult)
    });
    assert.equal(needsApproval.response.status, 200);
    assert.equal(needsApproval.data.task.status, "approval_required");
    assert.equal(server.notifications.length, 1);

    const implicitApproval = await requestJson(server.baseUrl, `/api/tasks/${leased.data.task.id}/approve`, {
      token: "admin-token",
      method: "POST",
      body: {
        approvalId: needsApproval.data.approval.id
      }
    });
    assert.equal(implicitApproval.response.status, 400);
    assert.equal(implicitApproval.data.error, "missing_approval_decision");

    const denied = await requestJson(server.baseUrl, `/api/tasks/${leased.data.task.id}/approve`, {
      token: "codex-token",
      method: "POST",
      body: {
        approvalId: needsApproval.data.approval.id,
        approved: true
      }
    });
    assert.equal(denied.response.status, 403);

    const approved = await requestJson(server.baseUrl, `/api/tasks/${leased.data.task.id}/approve`, {
      token: "admin-token",
      method: "POST",
      body: {
        approvalId: needsApproval.data.approval.id,
        approved: true,
        note: "test approval"
      }
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.data.task.status, "queued");
    assert.equal(approved.data.task.currentStep, "publish");

    const publishLease = await leaseNextTask(server);
    const publishResult = await runTask(publishLease.data.task);
    assert.equal(publishResult.status, "completed");

    const completed = await requestJson(server.baseUrl, `/api/executor/tasks/${publishLease.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(publishLease.data.task, publishResult)
    });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.data.task.status, "completed");
    assert.ok(completed.data.task.result.published.publishId.startsWith("publish_"));
  });

  it("completes read_detect without publish approval", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "read_detect",
        input: { text: "公开测试文本", title: "只检测" }
      }
    });
    const leased = await leaseNextTask(server);
    assert.equal(leased.data.task.id, created.data.task.id);
    const result = await runTask(leased.data.task);
    assert.equal(result.status, "completed");
  });

  it("binds executor results to one active lease and rejects replay", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "read_detect",
        input: { text: "lease binding test", title: "result integrity" }
      }
    });

    const unleased = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: {
        status: "completed",
        executorId: "binding-executor",
        executorSessionId: "binding-session",
        leaseId: "00000000-0000-4000-8000-000000000000"
      }
    });
    assert.equal(unleased.response.status, 409);
    assert.equal(unleased.data.error, "executor_result_attempt_stale");

    const leased = await leaseNextTask(server, "binding-executor", "binding-session");
    assert.equal(leased.data.task.id, created.data.task.id);
    const validBody = boundExecutorResult(leased.data.task, {
      status: "completed",
      summary: "bound result accepted",
      result: { output: "ok" }
    });

    for (const body of [
      { ...validBody, executorId: "other-executor" },
      { ...validBody, executorSessionId: "other-session" },
      {
        ...validBody,
        leaseId: validBody.leaseId.replace(/.$/, validBody.leaseId.endsWith("0") ? "1" : "0")
      }
    ]) {
      const rejected = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
        token: "executor-token",
        method: "POST",
        body
      });
      assert.equal(rejected.response.status, 409);
      assert.equal(rejected.data.error, "executor_result_attempt_stale");
    }

    const accepted = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: validBody
    });
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.data.task.status, "completed");

    const replayed = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: validBody
    });
    assert.equal(replayed.response.status, 409);
    assert.equal(replayed.data.error, "executor_result_attempt_stale");

    const audit = await requestJson(server.baseUrl, `/api/audit?taskId=${created.data.task.id}`, {
      token: "admin-token"
    });
    assert.equal(audit.data.auditEvents.filter((event) => event.eventType === "task.completed").length, 1);
  });

  it("records AI Link audit summaries from executor results", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "read_detect",
        input: { text: "public audit test", title: "audit handoff" }
      }
    });
    assert.equal(created.response.status, 201);

    const leased = await leaseNextTask(server, "audit-test-executor", "audit-test-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const audit = {
      kind: "run",
      task: "auto_ops.research",
      provider: "grok",
      providerType: "grok",
      model: "grok-4.3",
      dryRun: true,
      policy: "default",
      allowOutbound: "user-approved",
      policyDataClass: "public",
      policyAuditTags: ["default-outbound"],
      policyBudget: {
        maxInputTokens: 12000,
        maxOutputTokens: 3000
      },
      usageEstimate: {
        inputChars: 48,
        inputTokens: 12,
        outputTokens: 1600,
        estimatedCostUsd: 0.0042
      },
      approval: {
        required: true,
        approved: false,
        enforced: false,
        mode: "live",
        reason: "Outbound provider calls require user approval."
      },
      rawSecret: "drop me"
    };

    const reported = await requestJson(server.baseUrl, `/api/executor/tasks/${leased.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "completed",
        summary: "audit captured",
        audit,
        result: {
          output: "ok",
          audit,
          apiKey: "placeholder"
        }
      })
    });

    assert.equal(reported.response.status, 200);
    assert.equal(reported.data.task.status, "completed");
    assert.equal(reported.data.task.result.output, "ok");
    assert.equal(reported.data.task.result.audit, undefined);
    assert.equal(reported.data.task.result.apiKey, "[redacted]");
    assert.equal(reported.data.task.result.aiLinkAudit.provider, "grok");
    assert.equal(reported.data.task.result.aiLinkAudit.usageEstimate.inputTokens, 12);
    assert.equal(reported.data.task.result.aiLinkAudit.rawSecret, undefined);

    const detail = await requestJson(server.baseUrl, `/api/tasks/${leased.data.task.id}`, {
      token: "admin-token"
    });
    assert.equal(detail.response.status, 200);
    const taskAuditEvent = detail.data.auditEvents.find((event) => event.eventType === "ai_link.audit");
    assert.equal(taskAuditEvent.detail.status, "completed");
    assert.equal(taskAuditEvent.detail.audit.model, "grok-4.3");
    assert.equal(taskAuditEvent.detail.audit.usageEstimate.outputTokens, 1600);

    const auditList = await requestJson(server.baseUrl, `/api/audit?taskId=${leased.data.task.id}`, {
      token: "admin-token"
    });
    assert.equal(auditList.response.status, 200);
    assert.ok(auditList.data.auditEvents.some((event) => event.eventType === "ai_link.audit"));
    assert.equal(JSON.stringify(auditList.data).includes("sk-should"), false);
  });

  it("lets Codex append AI Link audit without changing task state", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "read_detect",
        input: { text: "public audit append test", title: "audit append" }
      }
    });
    assert.equal(created.response.status, 201);

    const appended = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}/audit`, {
      token: "codex-token",
      method: "POST",
      body: {
        recordId: "record-1",
        status: "submitted",
        audit: {
          kind: "run",
          task: "auto_ops.research",
          provider: "grok",
          providerType: "grok",
          model: "grok-4.3",
          policy: "default",
          usageEstimate: {
            inputTokens: 10,
            outputTokens: 20
          },
          rawSecret: "placeholder"
        }
      }
    });

    assert.equal(appended.response.status, 201);
    assert.equal(appended.data.task.status, "queued");
    assert.equal(appended.data.auditEvent.eventType, "ai_link.audit");
    assert.equal(appended.data.auditEvent.detail.recordId, "record-1");
    assert.equal(appended.data.auditEvent.detail.audit.provider, "grok");
    assert.equal(appended.data.auditEvent.detail.audit.usageEstimate.inputTokens, 10);
    assert.equal(JSON.stringify(appended.data).includes("placeholder"), false);

    const current = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}`, {
      token: "admin-token"
    });
    assert.equal(current.data.task.status, "queued");
    assert.ok(current.data.auditEvents.some((event) => event.eventType === "ai_link.audit"));

    const filtered = await requestJson(server.baseUrl, `/api/audit?taskId=${created.data.task.id}&eventType=ai_link.audit`, {
      token: "admin-token"
    });
    assert.equal(filtered.response.status, 200);
    assert.ok(filtered.data.auditEvents.length > 0);
    assert.ok(filtered.data.auditEvents.every((event) => event.eventType === "ai_link.audit"));

    const empty = await requestJson(server.baseUrl, `/api/audit?taskId=${created.data.task.id}&eventType=task.completed`, {
      token: "admin-token"
    });
    assert.equal(empty.response.status, 200);
    assert.equal(empty.data.auditEvents.length, 0);

    const cookie = await loginConsole(server.baseUrl, {
      password: "test-password",
      next: "/dashboard/audit"
    });

    const page = await fetch(`${server.baseUrl}/dashboard/audit?taskId=${created.data.task.id}&eventType=ai_link.audit`, {
      headers: { cookie }
    });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /审计日志/);
    assert.match(html, /AI Link 审计摘要/);
    assert.match(html, /grok/);
    assert.equal(html.includes("public audit append test"), false);
    assert.equal(html.includes("rawSecret"), false);

    await server.store.completeTask({
      taskId: created.data.task.id,
      summary: "test cleanup",
      result: {},
      actor: "test-cleanup"
    });
  });

  it("can mark a task action_required and retry it", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "draft_only",
        input: { text: "公开测试文本", title: "需要人工处理" }
      }
    });
    assert.equal(created.response.status, 201);

    const leased = await leaseNextTask(server, "action-test-executor", "action-test-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const actionRequired = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "needs_action",
        summary: "需要人工续登",
        error: { message: "login_required" },
        result: { nextStep: "refresh_login" }
      })
    });
    assert.equal(actionRequired.response.status, 200);
    assert.equal(actionRequired.data.task.status, "action_required");
    assert.equal(actionRequired.data.task.error.message, "login_required");

    const filtered = await requestJson(server.baseUrl, "/api/tasks?status=action_required", {
      token: "admin-token"
    });
    assert.equal(filtered.response.status, 200);
    assert.ok(filtered.data.tasks.some((task) => task.id === created.data.task.id));
    assert.ok(filtered.data.tasks.every((task) => task.status === "action_required"));

    const deniedRetry = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}/retry`, {
      token: "codex-token",
      method: "POST",
      body: { note: "codex cannot requeue high-risk actions" }
    });
    assert.equal(deniedRetry.response.status, 403);

    const retried = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}/retry`, {
      token: "admin-token",
      method: "POST",
      body: { note: "login refreshed" }
    });
    assert.equal(retried.response.status, 200);
    assert.equal(retried.data.task.status, "queued");
    assert.equal(retried.data.task.error, null);

    await server.store.completeTask({
      taskId: created.data.task.id,
      summary: "test cleanup",
      result: {},
      actor: "test-cleanup"
    });
  });

  it("accepts AI Link audit summaries without exposing raw executor payloads", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "draft_only",
        input: { text: "公开测试文本", title: "审计摘要" }
      }
    });
    assert.equal(created.response.status, 201);

    const leased = await leaseNextTask(server, "audit-summary-executor", "audit-summary-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const completed = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "completed",
        summary: "已完成",
        result: {
          text: "公开摘要",
          password: "placeholder",
          audit: {
            rawNote: "drop me"
          }
        },
        audit: {
          kind: "run",
          task: "auto_ops.research",
          provider: "grok",
          providerType: "grok",
          model: "grok-4.3",
          policy: "default",
          policyAuditTags: ["default-outbound"],
          policyBudget: { maxInputTokens: 12000, unknown: "drop me" },
          usageEstimate: { inputTokens: 10, outputTokens: 20 },
          approval: {
            required: true,
            approved: false,
            enforced: false,
            mode: "live",
            reason: "Outbound provider calls require user approval."
          },
          rawSecret: "drop me too"
        }
      })
    });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.data.task.result.password, "[redacted]");
    assert.equal(completed.data.task.result.audit, undefined);
    assert.equal(completed.data.task.result.aiLinkAudit.kind, "run");
    assert.equal(completed.data.task.result.aiLinkAudit.providerType, "grok");
    assert.deepEqual(completed.data.task.result.aiLinkAudit.policyAuditTags, ["default-outbound"]);
    assert.equal(completed.data.task.result.aiLinkAudit.policyBudget.maxInputTokens, 12000);
    assert.equal(completed.data.task.result.aiLinkAudit.policyBudget.unknown, undefined);
    assert.equal(completed.data.task.result.aiLinkAudit.rawSecret, undefined);

    const detail = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}`, {
      token: "admin-token"
    });
    assert.equal(detail.response.status, 200);
    const auditEvent = detail.data.auditEvents.find((event) => event.eventType === "ai_link.audit");
    assert.equal(auditEvent.detail.audit.providerType, "grok");
    assert.equal(auditEvent.detail.audit.rawSecret, undefined);
  });

  it("exposes connector contracts to Codex as read-only status", async () => {
    const result = await requestJson(server.baseUrl, "/api/connectors", {
      token: "codex-token"
    });

    assert.equal(result.response.status, 200);
    const wechat = result.data.connectors.find((connector) => connector.platform === "wechat_official");
    const douyin = result.data.connectors.find((connector) => connector.platform === "douyin");
    assert.equal(wechat.status, "available");
    assert.equal(wechat.capabilities.some((capability) => capability.name === "publish" && capability.available), true);
    assert.equal(douyin.status, "reserved");
    assert.equal(result.data.issues.length, 0);
  });

  it("classifies connector login expiry as a manual action", async () => {
    const result = await runTask(
      {
        workflow: "read_detect",
        currentStep: "process",
        input: { url: "https://mp.weixin.qq.com/s/login-needed" }
      },
      {
        registry: {
          wechat_official: {
            readContent: async () => {
              const error = new Error("微信公众号登录已过期，需要本机续登。");
              error.code = "login_expired";
              error.platform = "wechat_official";
              error.action = "打开本地浏览器 profile 续登公众号后台";
              error.needsAction = true;
              throw error;
            }
          },
          zhuque_ai: {}
        }
      }
    );

    assert.equal(result.status, "needs_action");
    assert.equal(result.error.code, "login_expired");
    assert.equal(result.error.platform, "wechat_official");
    assert.equal(result.error.retryable, true);
  });

  it("runs a GSC monitor task and preserves Google refresh as a completed observation", async () => {
    const result = await runTask(
      {
        workflow: "gsc_monitor",
        currentStep: "process",
        input: {
          siteUrl: "https://voice.example.com/",
          urls: ["https://voice.example.com/guide"],
          sitemaps: ["https://voice.example.com/sitemap.xml"]
        }
      },
      {
        registry: {
          google_search_console: {
            monitorSite: async () => ({
              checkedAt: "2026-07-11T00:00:00.000Z",
              nextCheckAt: "2026-07-12T00:00:00.000Z",
              summary: {
                conclusion: "站点技术抓取条件正常，Google Index 仍在刷新。",
                requiresManualAction: false,
                counts: { discovered_not_indexed: 1 }
              },
              reportMarkdown: "# GSC 自动检查报告\n\n结论：等待 Google 刷新。\n",
              urls: [{
                url: "https://voice.example.com/guide",
                status: "discovered_not_indexed"
              }]
            })
          }
        }
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.result.urls[0].status, "discovered_not_indexed");
    assert.equal(result.artifacts[0].kind, "gsc-status-report");
  });

  it("persists a redacted blocked connector result for Hermes to inspect", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: {
          platform: "wechat_official",
          operation: "check_health"
        }
      }
    });
    assert.equal(created.response.status, 201);

    const leased = await leaseNextTask(server, "wechat-failure-executor", "wechat-failure-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const reported = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "failed",
        summary: "公众号 API 当前不可达。",
        error: {
          code: "source_unreachable",
          platform: "wechat_official",
          retryable: true
        },
        result: {
          schema_version: "1",
          platform: "wechat_official",
          operation: "check_health",
          status: "blocked",
          session: {
            state: "not_required",
            checked_at: "2026-07-11T08:00:00.000Z",
            token: "test-private-session-token"
          },
          items: [],
          action_required: {
            code: "source_unreachable",
            action: "verify_source_reachability",
            retryable: true
          },
          diagnostics: {
            item_count: 0,
            raw_response: "private-response"
          }
        }
      })
    });

    assert.equal(reported.response.status, 200);
    assert.equal(reported.data.task.status, "failed");
    assert.equal(reported.data.task.result.status, "blocked");
    assert.deepEqual(reported.data.task.result.session, {
      state: "not_required",
      checked_at: "2026-07-11T08:00:00.000Z"
    });
    assert.equal(reported.data.task.result.diagnostics.raw_response, "[redacted-content]");
    assert.equal(JSON.stringify(reported.data).includes("test-private-session-token"), false);
    assert.equal(JSON.stringify(reported.data).includes("private-response"), false);
  });

  it("describes connector capability contracts without private state", () => {
    const description = describeConnectorRegistry(createConnectorRegistry());
    assert.deepEqual(description.issues, []);

    const wechat = description.connectors.find((connector) => connector.platform === "wechat_official");
    assert.equal(wechat.status, "available");
    assert.deepEqual(
      wechat.capabilities.map((capability) => capability.name),
      ["check_health", "read_content", "create_draft", "publish", "metrics"]
    );
    assert.ok(wechat.capabilities.every((capability) => capability.available));

    const zhuque = description.connectors.find((connector) => connector.platform === "zhuque_ai");
    assert.equal(zhuque.status, "available");
    assert.equal(zhuque.capabilities[0].name, "detect");

    const douyin = description.connectors.find((connector) => connector.platform === "douyin");
    assert.equal(douyin.status, "reserved");
    assert.ok(douyin.capabilities.every((capability) => !capability.available));
  });

  it("requires approval before running an interactive platform login", async () => {
    let beginLoginCalls = 0;
    const registry = createConnectorRegistry({
      privateConnectors: {
        xiaohongshu: {
          status: "available",
          beginLogin: async () => {
            beginLoginCalls += 1;
            return {
              schema_version: "1",
              platform: "xiaohongshu",
              operation: "begin_login",
              status: "needs_action",
              session: {
                state: "verification_required",
                checked_at: "2026-07-11T08:00:00.000Z"
              },
              items: [],
              action_required: {
                code: "verification_required"
              },
              diagnostics: {
                item_count: 0
              }
            };
          }
        }
      }
    });

    const first = await runTask({
      workflow: "platform_auth_collect",
      currentStep: "process",
      input: {
        platform: "xiaohongshu",
        operation: "begin_login"
      }
    }, { registry });
    assert.equal(first.status, "needs_approval");
    assert.equal(first.approval.type, "platform_interactive_login");
    assert.equal(first.approval.nextStep, "platform_interactive_login");
    assert.equal(first.result.approval_required.code, "interactive_approval_required");
    assert.equal(beginLoginCalls, 0);

    const second = await runTask({
      workflow: "platform_auth_collect",
      currentStep: "platform_interactive_login",
      input: {
        platform: "xiaohongshu",
        operation: "begin_login"
      }
    }, { registry });
    assert.equal(second.status, "needs_action");
    assert.equal(second.error.code, "verification_required");
    assert.equal(beginLoginCalls, 1);
  });

  it("exposes connector status through a read-only API", async () => {
    const allowed = await requestJson(server.baseUrl, "/api/connectors", {
      token: "codex-token"
    });
    assert.equal(allowed.response.status, 200);
    assert.ok(Array.isArray(allowed.data.connectors));
    assert.ok(allowed.data.connectors.some((connector) => connector.platform === "wechat_official"));
    assert.ok(allowed.data.connectors.some((connector) => connector.platform === "douyin" && connector.status === "reserved"));

    const serialized = JSON.stringify(allowed.data);
    assert.equal(serialized.includes("admin-token"), false);
    assert.equal(serialized.includes("executor-token"), false);
    assert.equal(serialized.includes("cookie"), false);
    assert.equal(serialized.includes("profile"), false);

    const denied = await requestJson(server.baseUrl, "/api/connectors", {
      token: "executor-token"
    });
    assert.equal(denied.response.status, 403);
  });

  it("summarizes pending interactive login approvals in auth status", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: {
          platform: "xiaohongshu",
          operation: "begin_login"
        }
      }
    });
    assert.equal(created.response.status, 201);

    const leased = await leaseNextTask(server, "approval-status-executor", "approval-status-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const reported = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "needs_approval",
        summary: "需要人工批准后，才会在本机执行交互式平台登录。",
        approval: {
          type: "platform_interactive_login",
          title: "确认本机交互登录",
          summary: "批准后，本机执行器可以调用受信任私有连接器的交互登录流程。",
          nextStep: "platform_interactive_login"
        },
        result: {
          schema_version: "1",
          platform: "xiaohongshu",
          operation: "begin_login",
          approval_required: {
            code: "interactive_approval_required",
            action: "approve_platform_interactive_login",
            retryable: false
          },
          token: "private-token"
        }
      })
    });
    assert.equal(reported.response.status, 200);
    assert.equal(reported.data.task.status, "approval_required");

    const status = await requestJson(server.baseUrl, "/api/auth-status", {
      token: "codex-token"
    });
    assert.equal(status.response.status, 200);
    const xiaohongshu = status.data.authStatus.items.find((item) => item.platform === "xiaohongshu");
    assert.equal(xiaohongshu.status, "needs_action");
    assert.equal(xiaohongshu.reason, "interactive_approval_required");
    assert.deepEqual(xiaohongshu.relatedTaskIds, [created.data.task.id]);
    assert.equal(status.data.authStatus.summary.next_actions, 1);
    assert.equal(status.data.authStatus.nextActions[0].platform, "xiaohongshu");
    assert.equal(status.data.authStatus.nextActions[0].owner, "maintainer");
    assert.equal(status.data.authStatus.nextActions[0].severity, "approval");
    assert.match(status.data.authStatus.nextActions[0].runbook, /审批本机交互登录/);
    assert.deepEqual(status.data.authStatus.nextActions[0].relatedTaskIds, [created.data.task.id]);
    assert.equal(status.data.authStatus.nextActions[0].retryAfterAction, false);
    assert.equal(JSON.stringify(status.data).includes("private-token"), false);
  });

  it("summarizes connector auth status without exposing private state", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: {
          platform: "xiaohongshu",
          operation: "check_session"
        }
      }
    });
    assert.equal(created.response.status, 201);

    const leased = await leaseNextTask(server, "session-status-executor", "session-status-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const reported = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "needs_action",
        summary: "需要本机续登",
        error: {
          code: "login_expired",
          platform: "xiaohongshu",
          message: "login_expired",
          cookie: "private-cookie",
          profile: "private-profile"
        },
        result: {
          platform: "xiaohongshu",
          action_required: {
            code: "login_expired"
          },
          token: "private-token"
        }
      })
    });
    assert.equal(reported.response.status, 200);
    assert.equal(reported.data.task.status, "action_required");

    const status = await requestJson(server.baseUrl, "/api/auth-status", {
      token: "codex-token"
    });
    assert.equal(status.response.status, 200);
    const xiaohongshu = status.data.authStatus.items.find((item) => item.platform === "xiaohongshu");
    assert.equal(xiaohongshu.status, "needs_action");
    assert.equal(xiaohongshu.reason, "login_expired");
    assert.equal(xiaohongshu.relatedTaskIds[0], created.data.task.id);
    assert.ok(xiaohongshu.relatedTaskIds.includes(created.data.task.id));
    const nextAction = status.data.authStatus.nextActions.find((action) => (
      action.platform === "xiaohongshu" && action.reason === "login_expired"
    ));
    assert.equal(nextAction.owner, "account_owner");
    assert.equal(nextAction.severity, "manual");
    assert.equal(nextAction.retryAfterAction, true);
    assert.match(nextAction.runbook, /续登/);

    const serialized = JSON.stringify(status.data);
    assert.equal(serialized.includes("private-cookie"), false);
    assert.equal(serialized.includes("private-profile"), false);
    assert.equal(serialized.includes("private-token"), false);

    const cookie = await loginConsole(server.baseUrl, {
      password: "test-password",
      next: "/dashboard/connectors"
    });

    const page = await fetch(`${server.baseUrl}/dashboard/connectors`, {
      headers: { cookie }
    });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /授权\/登录关注项/);
    assert.match(html, /下一步行动/);
    assert.match(html, /账号负责人/);
    assert.match(html, /需要续登/);
    assert.match(html, /xiaohongshu/);
    assert.equal(html.includes("private-cookie"), false);
    assert.equal(html.includes("private-profile"), false);
    assert.equal(html.includes("private-token"), false);

    const denied = await requestJson(server.baseUrl, "/api/auth-status", {
      token: "executor-token"
    });
    assert.equal(denied.response.status, 403);
  });

  it("summarizes GitHub authorization issues as secret-owner next actions", async () => {
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: "admin-token",
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: {
          platform: "github",
          operation: "check_auth",
          owner: "xiaoqi-AI",
          repo: "ai_Link",
          scope: "repo_read",
          credential: "private-github-marker"
        }
      }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.task.input.credential, undefined);
    assert.deepEqual(created.data.task.targets, ["github"]);

    const leased = await leaseNextTask(server, "github-status-executor", "github-status-session");
    assert.equal(leased.data.task.id, created.data.task.id);

    const reported = await requestJson(server.baseUrl, `/api/executor/tasks/${created.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: boundExecutorResult(leased.data.task, {
        status: "needs_action",
        summary: "平台 API 凭据尚未配置。",
        error: {
          code: "credential_missing",
          platform: "github",
          message: "credential_missing",
          credential: "private-github-marker"
        },
        result: {
          schema_version: "1",
          platform: "github",
          operation: "check_auth",
          status: "needs_action",
          session: {
            state: "missing",
            checked_at: "2026-07-11T08:00:00.000Z",
            credential: "private-github-marker"
          },
          action_required: {
            code: "credential_missing"
          }
        }
      })
    });
    assert.equal(reported.response.status, 200);
    assert.equal(reported.data.task.status, "action_required");

    const status = await requestJson(server.baseUrl, "/api/auth-status", {
      token: "codex-token"
    });
    assert.equal(status.response.status, 200);
    const github = status.data.authStatus.items.find((item) => item.platform === "github");
    assert.equal(github.status, "needs_action");
    assert.equal(github.reason, "credential_missing");
    const nextAction = status.data.authStatus.nextActions.find((action) => action.platform === "github");
    assert.equal(nextAction.owner, "secret_owner");
    assert.equal(nextAction.severity, "blocked");
    assert.match(nextAction.runbook, /凭据/);
    assert.equal(JSON.stringify(status.data).includes("private-github-marker"), false);
  });

  it("redacts sensitive keys and raw content", () => {
    const value = redact({
      token: "placeholder",
      nested: {
        cookie: "placeholder-cookie",
        rawHtml: "<html>private</html>",
        safe: "visible"
      }
    });
    assert.equal(value.token, "[redacted]");
    assert.equal(value.nested.cookie, "[redacted]");
    assert.equal(value.nested.rawHtml, "[redacted-content]");
    assert.equal(value.nested.safe, "visible");
  });

  it("marks Auth Status coverage incomplete when the 51st action task exists", async () => {
    const coverageServer = await startTestServer();
    const addActionTask = async (index) => {
      const task = await coverageServer.store.createTask({
        workflow: "read_detect",
        input: { text: `coverage-${index}`, platform: "github" },
        targets: ["github"],
        options: {},
        createdBy: "coverage-test"
      });
      await coverageServer.store.markTaskNeedsAction({
        taskId: task.id,
        summary: "coverage boundary",
        result: { platform: "github" },
        error: { code: "credential_missing", platform: "github" },
        actor: "coverage-test"
      });
    };

    try {
      for (let index = 0; index < 50; index += 1) {
        await addActionTask(index);
      }
      const complete = await requestJson(coverageServer.baseUrl, "/api/auth-status", { token: "codex-token" });
      assert.equal(complete.data.authStatus.schemaVersion, "2");
      assert.equal(complete.data.authStatus.summary.action_tasks_complete, true);
      assert.equal(complete.data.authStatus.summary.action_tasks_truncated, false);

      await addActionTask(50);
      const truncated = await requestJson(coverageServer.baseUrl, "/api/auth-status", { token: "codex-token" });
      assert.equal(truncated.response.status, 200);
      assert.equal(truncated.data.authStatus.summary.action_tasks_complete, false);
      assert.equal(truncated.data.authStatus.summary.action_tasks_truncated, true);
      assert.equal(truncated.data.authStatus.items.some((item) => item.status === "ready"), false);
    } finally {
      await coverageServer.close();
    }
  });

  it("fails closed when Cloudflare Access JWT validation is not configured", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      AI_LINK_APP_PASSWORD: "test-password",
      AI_LINK_SESSION_SECRET: "test-session-secret",
      AI_LINK_ADMIN_TOKEN: "admin-token",
      AI_LINK_EXECUTOR_TOKEN: "executor-token",
      AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "1",
      AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com"
    });
    const { app } = await createApp({
      config,
      store: new MemoryStore(),
      notifier: { approvalRequested: async () => {} }
    });
    const local = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const baseUrl = `http://127.0.0.1:${local.address().port}`;
    try {
      const denied = await fetch(`${baseUrl}/api/tasks`, {
        headers: { authorization: "Bearer admin-token" }
      });
      assert.equal(denied.status, 403);

      const unverified = await fetch(`${baseUrl}/api/tasks`, {
        headers: {
          authorization: "Bearer admin-token",
          "cf-access-authenticated-user-email": "owner@example.com",
          "cf-access-jwt-assertion": "placeholder-jwt"
        }
      });
      assert.equal(unverified.status, 403);
      assert.equal((await unverified.json()).detail, "jwt_validation_not_configured");
    } finally {
      await new Promise((resolve) => local.close(resolve));
    }
  });
});

async function loginConsole(baseUrl, { password, next }) {
  const page = await fetch(`${baseUrl}/login`);
  const csrfCookie = responseCookie(page, "ai_link_csrf");
  const csrfToken = (await page.text()).match(/name="csrfToken" value="([^"]+)"/)?.[1];
  assert.ok(csrfCookie);
  assert.ok(csrfToken);

  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: baseUrl,
      cookie: csrfCookie
    },
    body: new URLSearchParams({ password, next, csrfToken }),
    redirect: "manual"
  });
  assert.equal(response.status, 303);
  const sessionCookie = responseCookie(response, "ai_link_session");
  assert.ok(sessionCookie);
  return sessionCookie;
}

function responseCookie(response, name) {
  const header = response.headers.get("set-cookie") || "";
  const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`));
  return match ? `${name}=${match[1]}` : "";
}
