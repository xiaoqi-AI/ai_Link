import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
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

    const leased = await requestJson(server.baseUrl, "/api/executor/lease", {
      token: "executor-token",
      method: "POST",
      body: { executorId: "test-executor" }
    });
    assert.equal(leased.response.status, 200);
    assert.equal(leased.data.task.status, "running");

    const firstResult = await runTask(leased.data.task);
    assert.equal(firstResult.status, "needs_approval");
    const needsApproval = await requestJson(server.baseUrl, `/api/executor/tasks/${leased.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: firstResult
    });
    assert.equal(needsApproval.response.status, 200);
    assert.equal(needsApproval.data.task.status, "approval_required");
    assert.equal(server.notifications.length, 1);

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

    const publishLease = await requestJson(server.baseUrl, "/api/executor/lease", {
      token: "executor-token",
      method: "POST",
      body: { executorId: "test-executor" }
    });
    const publishResult = await runTask(publishLease.data.task);
    assert.equal(publishResult.status, "completed");

    const completed = await requestJson(server.baseUrl, `/api/executor/tasks/${publishLease.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: publishResult
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
    const leased = await requestJson(server.baseUrl, "/api/executor/lease", {
      token: "executor-token",
      method: "POST",
      body: { executorId: "test-executor" }
    });
    assert.equal(leased.data.task.id, created.data.task.id);
    const result = await runTask(leased.data.task);
    assert.equal(result.status, "completed");
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

    const leased = await requestJson(server.baseUrl, "/api/executor/lease", {
      token: "executor-token",
      method: "POST",
      body: { executorId: "action-test-executor" }
    });
    assert.equal(leased.data.task.id, created.data.task.id);

    const actionRequired = await requestJson(server.baseUrl, `/api/executor/tasks/${leased.data.task.id}/result`, {
      token: "executor-token",
      method: "POST",
      body: {
        status: "needs_action",
        summary: "需要人工续登",
        error: { message: "login_required" },
        result: { nextStep: "refresh_login" }
      }
    });
    assert.equal(actionRequired.response.status, 200);
    assert.equal(actionRequired.data.task.status, "action_required");
    assert.equal(actionRequired.data.task.error.message, "login_required");

    const filtered = await requestJson(server.baseUrl, "/api/tasks?status=action_required", {
      token: "admin-token"
    });
    assert.equal(filtered.response.status, 200);
    assert.ok(filtered.data.tasks.some((task) => task.id === leased.data.task.id));
    assert.ok(filtered.data.tasks.every((task) => task.status === "action_required"));

    const deniedRetry = await requestJson(server.baseUrl, `/api/tasks/${leased.data.task.id}/retry`, {
      token: "codex-token",
      method: "POST",
      body: { note: "codex cannot requeue high-risk actions" }
    });
    assert.equal(deniedRetry.response.status, 403);

    const retried = await requestJson(server.baseUrl, `/api/tasks/${leased.data.task.id}/retry`, {
      token: "admin-token",
      method: "POST",
      body: { note: "login refreshed" }
    });
    assert.equal(retried.response.status, 200);
    assert.equal(retried.data.task.status, "queued");
    assert.equal(retried.data.task.error, null);
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

  it("can require Cloudflare Access headers before API access", async () => {
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

      const allowed = await fetch(`${baseUrl}/api/tasks`, {
        headers: {
          authorization: "Bearer admin-token",
          "cf-access-authenticated-user-email": "owner@example.com",
          "cf-access-jwt-assertion": "placeholder-jwt"
        }
      });
      assert.equal(allowed.status, 200);

      const wrongEmail = await fetch(`${baseUrl}/api/tasks`, {
        headers: {
          authorization: "Bearer admin-token",
          "cf-access-authenticated-user-email": "other@example.com",
          "cf-access-jwt-assertion": "placeholder-jwt"
        }
      });
      assert.equal(wrongEmail.status, 403);

      const missingEmail = await fetch(`${baseUrl}/api/tasks`, {
        headers: {
          authorization: "Bearer admin-token",
          "cf-access-jwt-assertion": "placeholder-jwt"
        }
      });
      assert.equal(missingEmail.status, 403);
    } finally {
      await new Promise((resolve) => local.close(resolve));
    }
  });
});
