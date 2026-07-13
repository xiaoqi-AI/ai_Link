import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LoginRateLimiter, loginRateLimitKey } from "../src/security/loginRateLimit.js";
import { MemoryStore } from "../src/storage/memoryStore.js";

describe("Auth Hub browser request security", () => {
  it("binds CSRF tokens to the browser and session for every console write", async () => {
    const server = await startHub();
    try {
      const missingLoginToken = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        next: "/dashboard"
      });
      assert.equal(missingLoginToken.status, 403);

      const loginPage = await getPage(server.baseUrl, "/login?next=https%3A%2F%2Fevil.example");
      assert.equal(loginPage.response.status, 200);
      assert.match(loginPage.html, /name="next" value="\/dashboard"/);
      assert.match(loginPage.setCookie, /HttpOnly/);
      assert.match(loginPage.setCookie, /SameSite=Strict/);

      const loggedIn = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        next: "//evil.example",
        csrfToken: loginPage.csrfToken
      }, loginPage.csrfCookie);
      assert.equal(loggedIn.status, 303);
      assert.equal(loggedIn.headers.get("location"), "/dashboard");
      const sessionCookie = responseCookie(loggedIn, "ai_link_session");
      assert.ok(sessionCookie);
      const browserCookies = `${loginPage.csrfCookie}; ${sessionCookie}`;

      const taskForm = await getPage(server.baseUrl, "/dashboard/new", browserCookies);
      assert.equal(taskForm.response.status, 200);
      assert.ok(taskForm.csrfToken);
      assert.notEqual(taskForm.csrfToken, loginPage.csrfToken);

      const missingTaskToken = await postForm(server.baseUrl, "/dashboard/tasks", {
        workflow: "full_chain",
        url: "https://example.com/source"
      }, browserCookies);
      assert.equal(missingTaskToken.status, 403);
      assert.equal((await server.store.listTasks()).length, 0);

      const preauthReplay = await postForm(server.baseUrl, "/dashboard/tasks", {
        workflow: "full_chain",
        url: "https://example.com/source",
        csrfToken: loginPage.csrfToken
      }, browserCookies);
      assert.equal(preauthReplay.status, 403);
      assert.equal((await server.store.listTasks()).length, 0);

      const created = await postForm(server.baseUrl, "/dashboard/tasks", {
        workflow: "full_chain",
        url: "https://example.com/source",
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(created.status, 303);
      const [task] = await server.store.listTasks();
      assert.ok(task);

      const queuedAuditCount = (await server.store.listAuditEvents({ taskId: task.id })).length;
      const queuedRetry = await postForm(server.baseUrl, `/dashboard/tasks/${task.id}/retry`, {
        note: "must not retry queued work",
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(queuedRetry.status, 409);
      assert.equal((await server.store.getTask(task.id)).status, "queued");
      assert.equal((await server.store.listAuditEvents({ taskId: task.id })).length, queuedAuditCount);

      await server.store.markTaskNeedsAction({
        taskId: task.id,
        summary: "manual action",
        result: {},
        error: { message: "login_required" },
        actor: "test"
      });
      const deniedRetry = await postForm(server.baseUrl, `/dashboard/tasks/${task.id}/retry`, {
        note: "handled"
      }, browserCookies);
      assert.equal(deniedRetry.status, 403);
      assert.equal((await server.store.getTask(task.id)).status, "action_required");

      const retried = await postForm(server.baseUrl, `/dashboard/tasks/${task.id}/retry`, {
        note: "handled",
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(retried.status, 303);
      assert.equal((await server.store.getTask(task.id)).status, "queued");

      const approvalTask = await server.store.createTask({
        workflow: "full_chain",
        input: { url: "https://example.com/approval" },
        targets: ["wechat_official"],
        options: {},
        createdBy: "test"
      });
      const approvalResult = await server.store.markTaskNeedsApproval({
        taskId: approvalTask.id,
        summary: "approval required",
        result: {},
        approval: { title: "Confirm", summary: "Confirm", nextStep: "publish" },
        actor: "test"
      });
      const deniedApproval = await postForm(server.baseUrl, `/dashboard/tasks/${approvalTask.id}/approve`, {
        approvalId: approvalResult.approval.id,
        decision: "approve"
      }, browserCookies);
      assert.equal(deniedApproval.status, 403);
      assert.equal((await server.store.getApproval(approvalResult.approval.id)).status, "pending");

      const invalidApproval = await postForm(server.baseUrl, `/dashboard/tasks/${approvalTask.id}/approve`, {
        approvalId: approvalResult.approval.id,
        decision: "invalid",
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(invalidApproval.status, 400);
      assert.equal((await server.store.getApproval(approvalResult.approval.id)).status, "pending");

      const approved = await postForm(server.baseUrl, `/dashboard/tasks/${approvalTask.id}/approve`, {
        approvalId: approvalResult.approval.id,
        decision: "approve",
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(approved.status, 303);
      assert.equal((await server.store.getApproval(approvalResult.approval.id)).status, "approved");

      const replayedApproval = await postForm(server.baseUrl, `/dashboard/tasks/${approvalTask.id}/approve`, {
        approvalId: approvalResult.approval.id,
        decision: "approve",
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(replayedApproval.status, 409);

      const getLogout = await fetch(`${server.baseUrl}/logout`, { redirect: "manual" });
      assert.equal(getLogout.status, 404);
      const deniedLogout = await postForm(server.baseUrl, "/logout", {}, browserCookies);
      assert.equal(deniedLogout.status, 403);
      const loggedOut = await postForm(server.baseUrl, "/logout", {
        csrfToken: taskForm.csrfToken
      }, browserCookies);
      assert.equal(loggedOut.status, 303);
      assert.match(loggedOut.headers.get("set-cookie") || "", /Max-Age=0/);
    } finally {
      await server.close();
    }
  });

  it("requires a same-origin browser source and rejects expired CSRF tokens", async () => {
    let now = Date.parse("2026-07-13T00:00:00.000Z");
    const server = await startHub({
      clock: () => now,
      env: { AI_LINK_CSRF_TOKEN_TTL_SECONDS: "300" }
    });
    try {
      const page = await getPage(server.baseUrl, "/login");
      const wrongOrigin = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        csrfToken: page.csrfToken
      }, page.csrfCookie, { origin: "https://evil.example" });
      assert.equal(wrongOrigin.status, 403);

      const missingSource = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        csrfToken: page.csrfToken
      }, page.csrfCookie, { origin: "" });
      assert.equal(missingSource.status, 403);

      const refererOnly = await postForm(server.baseUrl, "/login", {
          password: "test-browser-password",
        csrfToken: page.csrfToken
      }, page.csrfCookie, { origin: "", referer: `${server.baseUrl}/login` });
      assert.equal(refererOnly.status, 303);

      const expiringPage = await getPage(server.baseUrl, "/login");
      now += 300000;
      const expired = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        csrfToken: expiringPage.csrfToken
      }, expiringPage.csrfCookie);
      assert.equal(expired.status, 403);
    } finally {
      await server.close();
    }
  });

  it("locks repeated login failures and recovers only after the configured block", async () => {
    let now = Date.parse("2026-07-13T00:00:00.000Z");
    const server = await startHub({
      clock: () => now,
      env: {
        AI_LINK_LOGIN_MAX_FAILURES: "3",
        AI_LINK_LOGIN_WINDOW_SECONDS: "60",
        AI_LINK_LOGIN_BLOCK_SECONDS: "60"
      }
    });
    try {
      const page = await getPage(server.baseUrl, "/login");
      for (let index = 0; index < 3; index += 1) {
        const failed = await postForm(server.baseUrl, "/login", {
          password: "wrong-password",
          next: "/dashboard",
          csrfToken: page.csrfToken
        }, page.csrfCookie);
        assert.equal(failed.status, 401);
      }

      const blocked = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        next: "/dashboard",
        csrfToken: page.csrfToken
      }, page.csrfCookie);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get("retry-after"), "60");

      now += 60000;
      const recovered = await postForm(server.baseUrl, "/login", {
        password: "test-browser-password",
        next: "/dashboard",
        csrfToken: page.csrfToken
      }, page.csrfCookie);
      assert.equal(recovered.status, 303);
    } finally {
      await server.close();
    }
  });

  it("allows retries only after action_required or failed states", async () => {
    const store = new MemoryStore();
    const queued = await store.createTask({
      workflow: "draft_only",
      input: { text: "queued" },
      targets: [],
      options: {},
      createdBy: "test"
    });
    const queuedAuditCount = (await store.listAuditEvents({ taskId: queued.id })).length;
    assert.equal(await store.retryTask({ taskId: queued.id, actor: "test" }), null);
    assert.equal((await store.listAuditEvents({ taskId: queued.id })).length, queuedAuditCount);

    await store.completeTask({ taskId: queued.id, summary: "done", result: {}, actor: "test" });
    const completedAuditCount = (await store.listAuditEvents({ taskId: queued.id })).length;
    assert.equal(await store.retryTask({ taskId: queued.id, actor: "test" }), null);
    assert.equal((await store.listAuditEvents({ taskId: queued.id })).length, completedAuditCount);

    const running = await store.createTask({
      workflow: "draft_only",
      input: { text: "running" },
      targets: [],
      options: {},
      createdBy: "test"
    });
    const lease = await store.leaseTask({ executorId: "test-executor", leaseMs: 60000 });
    assert.equal(lease.id, running.id);
    const runningAuditCount = (await store.listAuditEvents({ taskId: running.id })).length;
    assert.equal(await store.retryTask({ taskId: running.id, actor: "test" }), null);
    assert.equal((await store.listAuditEvents({ taskId: running.id })).length, runningAuditCount);

    const cancelled = await store.createTask({
      workflow: "draft_only",
      input: { text: "cancelled" },
      targets: [],
      options: {},
      createdBy: "test"
    });
    const approvalResult = await store.markTaskNeedsApproval({
      taskId: cancelled.id,
      summary: "approval",
      result: {},
      approval: { title: "Confirm", summary: "Confirm", nextStep: "publish" },
      actor: "test"
    });
    await store.decideApproval({
      taskId: cancelled.id,
      approvalId: approvalResult.approval.id,
      approved: false,
      actor: "test",
      note: "reject"
    });
    const cancelledAuditCount = (await store.listAuditEvents({ taskId: cancelled.id })).length;
    assert.equal(await store.retryTask({ taskId: cancelled.id, actor: "test" }), null);
    assert.equal((await store.listAuditEvents({ taskId: cancelled.id })).length, cancelledAuditCount);
  });

  it("bounds and anonymizes login limiter keys", () => {
    let now = 1000;
    const limiter = new LoginRateLimiter({
      maxFailures: 3,
      windowMs: 1000,
      blockMs: 1000,
      maxKeys: 2,
      clock: () => now
    });
    limiter.recordFailure("one");
    now += 1;
    limiter.recordFailure("two");
    now += 1;
    limiter.recordFailure("three");
    assert.equal(limiter.size, 2);

    now += 1000;
    limiter.prune();
    assert.equal(limiter.size, 0);

    const first = loginRateLimitKey({
      cloudflareAccess: { email: "owner@example.com" }
    }, "test-secret");
    const second = loginRateLimitKey({
      cloudflareAccess: { email: "other@example.com" }
    }, "test-secret");
    assert.notEqual(first, second);
    assert.equal(first.includes("owner@example.com"), false);

    const bounded = loadConfig({
      NODE_ENV: "test",
      AI_LINK_CSRF_TOKEN_TTL_SECONDS: "999999",
      AI_LINK_LOGIN_MAX_FAILURES: "1",
      AI_LINK_LOGIN_WINDOW_SECONDS: "1",
      AI_LINK_LOGIN_BLOCK_SECONDS: "999999",
      AI_LINK_LOGIN_MAX_KEYS: "1"
    });
    assert.equal(bounded.csrfTokenTtlSeconds, 3600);
    assert.equal(bounded.loginRateLimit.maxFailures, 3);
    assert.equal(bounded.loginRateLimit.windowMs, 60000);
    assert.equal(bounded.loginRateLimit.blockMs, 86400000);
    assert.equal(bounded.loginRateLimit.maxKeys, 100);
  });
});

async function startHub({ env = {}, clock } = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_LINK_APP_PASSWORD: "test-browser-password",
    AI_LINK_SESSION_SECRET: "browser-test-session-secret",
    AI_LINK_ADMIN_TOKEN: "browser-test-admin-token",
    AI_LINK_EXECUTOR_TOKEN: "browser-test-executor-token",
    ...env
  });
  const store = new MemoryStore();
  const { app } = await createApp({
    config,
    store,
    clock,
    notifier: { approvalRequested: async () => {} }
  });
  const listener = await new Promise((resolve) => {
    const running = app.listen(0, "127.0.0.1", () => resolve(running));
  });
  return {
    store,
    baseUrl: `http://127.0.0.1:${listener.address().port}`,
    close: () => new Promise((resolve) => listener.close(resolve))
  };
}

async function getPage(baseUrl, path, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : undefined
  });
  const html = await response.text();
  return {
    response,
    html,
    setCookie: response.headers.get("set-cookie") || "",
    csrfCookie: responseCookie(response, "ai_link_csrf") || cookiePart(cookie, "ai_link_csrf"),
    csrfToken: html.match(/name="csrfToken" value="([^"]+)"/)?.[1] || ""
  };
}

function postForm(baseUrl, path, body, cookie = "", { origin = baseUrl, referer = "" } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(origin ? { origin } : {}),
      ...(referer ? { referer } : {}),
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(body),
    redirect: "manual"
  });
}

function responseCookie(response, name) {
  return cookiePart(response.headers.get("set-cookie") || "", name);
}

function cookiePart(header, name) {
  const match = String(header).match(new RegExp(`(?:^|[;,]\\s*)${name}=([^;]*)`));
  return match ? `${name}=${match[1]}` : "";
}
