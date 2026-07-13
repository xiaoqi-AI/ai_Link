import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import {
  ProjectTaskClientError,
  getProjectTask,
  requestAuthHubJson,
  runProjectTaskCli,
  waitForProjectTask
} from "../src/authHub/projectTaskClient.js";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/storage/memoryStore.js";
import { PostgresStore } from "../src/storage/postgresStore.js";

const PROJECT_A_TOKEN = "project-a-token-000000000000000000";
const PROJECT_B_TOKEN = "project-b-token-000000000000000000";

describe("Auth Hub project client", () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it("loads explicit per-project token policies without granting admin scopes", () => {
    const config = projectConfig();
    assert.deepEqual(config.projectClients, [
      {
        id: "parentinggame",
        actorName: "project.parentinggame",
        operations: ["github/check_auth"],
        githubTargets: [{
          repository: "private-owner/private-repository",
          scopes: ["repo_read", "actions_read"]
        }]
      },
      {
        id: "hermes",
        actorName: "project.hermes",
        operations: ["wechat_official/check_health"],
        githubTargets: []
      }
    ]);
    const projectToken = config.apiTokens.find((item) => item.name === "project.parentinggame");
    assert.deepEqual(projectToken.scopes, ["tasks:create", "tasks:read"]);
    assert.equal(projectToken.token, PROJECT_A_TOKEN);
  });

  it("rejects interactive or incomplete project policy manifests", () => {
    assert.throws(() => loadConfig({
      NODE_ENV: "test",
      AI_LINK_PROJECT_CLIENTS_JSON: JSON.stringify([{
        id: "parentinggame",
        tokenEnv: "PROJECT_A_TOKEN",
        operations: ["xiaohongshu/begin_login"]
      }]),
      PROJECT_A_TOKEN
    }), /unsupported operation/);

    assert.throws(() => loadConfig({
      NODE_ENV: "test",
      AI_LINK_PROJECT_CLIENTS_JSON: JSON.stringify([{
        id: "parentinggame",
        tokenEnv: "PROJECT_A_TOKEN",
        operations: ["github/check_auth"]
      }])
    }), /must contain a 24-4096 character token/);

    assert.throws(() => loadConfig({
      NODE_ENV: "test",
      AI_LINK_PROJECT_CLIENTS_JSON: JSON.stringify([{
        id: "parentinggame",
        tokenEnv: "PROJECT_A_TOKEN",
        operations: ["github/check_auth"]
      }]),
      PROJECT_A_TOKEN
    }), /githubTargets/);

    assert.throws(() => loadConfig({
      NODE_ENV: "test",
      AI_LINK_PROJECT_CLIENTS_JSON: JSON.stringify([{
        id: "parentinggame",
        tokenEnv: "PROJECT_A_TOKEN",
        operations: ["github/check_auth"],
        githubTargets: [{ repository: "owner/repo", scopes: ["admin"] }]
      }]),
      PROJECT_A_TOKEN
    }), /unsupported scope/);
  });

  it("enforces operation policy, request ids, idempotency, and own-task reads", async () => {
    const body = githubTaskBody("parentinggame-auth-001", "repo_read");
    const created = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.replayed, false);

    const replayed = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body
    });
    assert.equal(replayed.response.status, 200);
    assert.equal(replayed.data.replayed, true);
    assert.equal(replayed.data.task.id, created.data.task.id);

    const conflict = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body: githubTaskBody("parentinggame-auth-001", "actions_read")
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.data.error, "idempotency_conflict");

    const crossProjectRead = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}`, {
      token: PROJECT_B_TOKEN
    });
    assert.equal(crossProjectRead.response.status, 404);
    assert.equal(crossProjectRead.data.error, "task_not_found");

    const projectList = await requestJson(server.baseUrl, "/api/tasks", { token: PROJECT_B_TOKEN });
    assert.deepEqual(projectList.data.tasks, []);

    const adminRead = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}`, {
      token: "admin-token"
    });
    assert.equal(adminRead.response.status, 200);

    const codexRead = await requestJson(server.baseUrl, `/api/tasks/${created.data.task.id}`, {
      token: "codex-token"
    });
    assert.equal(codexRead.response.status, 200);

    const forbiddenWorkflow = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body: { workflow: "read_detect", input: { text: "not allowed" } }
    });
    assert.equal(forbiddenWorkflow.response.status, 403);
    assert.equal(forbiddenWorkflow.data.error, "project_task_not_allowed");

    const forbiddenOperation = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: { platform: "wechat_official", operation: "check_health" },
        options: { requestId: "parentinggame-auth-002" }
      }
    });
    assert.equal(forbiddenOperation.response.status, 403);
    assert.equal(forbiddenOperation.data.error, "project_operation_not_allowed");

    const forbiddenTarget = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: {
          platform: "github",
          operation: "check_auth",
          owner: "another-owner",
          repo: "another-repository",
          scope: "repo_read"
        },
        options: { requestId: "parentinggame-auth-003" }
      }
    });
    assert.equal(forbiddenTarget.response.status, 403);
    assert.equal(forbiddenTarget.data.error, "project_target_not_allowed");

    const missingRequestId = await requestJson(server.baseUrl, "/api/tasks", {
      token: PROJECT_A_TOKEN,
      method: "POST",
      body: {
        workflow: "platform_auth_collect",
        input: {
          platform: "github",
          operation: "check_auth",
          owner: "private-owner",
          repo: "private-repository"
        }
      }
    });
    assert.equal(missingRequestId.response.status, 400);
    assert.equal(missingRequestId.data.error, "project_request_id_required");
  });

  it("submits through the CLI without printing token or private target", async () => {
    const stdout = outputBuffer();
    const stderr = outputBuffer();
    const env = {
      AI_LINK_AUTH_HUB_URL: server.baseUrl,
      AI_LINK_PROJECT_TOKEN: PROJECT_A_TOKEN,
      PROJECT_GITHUB_TARGET: "private-owner/private-repository"
    };
    const exitCode = await runProjectTaskCli([
      "submit",
      "--platform", "github",
      "--operation", "check_auth",
      "--request-id", "parentinggame-cli-001",
      "--github-target-env", "PROJECT_GITHUB_TARGET",
      "--scope", "repo_read",
      "--json"
    ], { env, stdout, stderr });

    assert.equal(exitCode, 0);
    assert.equal(stderr.value, "");
    assert.doesNotMatch(stdout.value, /private-owner|private-repository|project-a-token/);
    const report = JSON.parse(stdout.value);
    assert.equal(report.ok, false);
    assert.equal(report.accepted, true);
    assert.equal(report.ready, false);
    assert.equal(report.task.platform, "github");
    assert.equal(report.task.operation, "check_auth");
    assert.equal(report.task.status, "queued");
    assert.deepEqual(Object.keys(report.task).sort(), [
      "createdAt",
      "id",
      "operation",
      "platform",
      "status",
      "updatedAt",
      "workflow"
    ]);
  });

  it("fails before fetch for unapproved targets, remote ports, and incomplete Service Auth", async () => {
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      throw new Error("unexpected request");
    };
    for (const testCase of [
      {
        baseUrl: "https://not-approved.example.test",
        env: { AI_LINK_AUTH_HUB_ALLOWED_HOSTS: "" },
        code: "auth_hub_target_rejected"
      },
      {
        baseUrl: "https://auth.example.test:8443",
        env: { AI_LINK_AUTH_HUB_ALLOWED_HOSTS: "auth.example.test" },
        code: "auth_hub_target_rejected"
      },
      {
        baseUrl: "https://auth.example.test",
        env: {
          AI_LINK_AUTH_HUB_ALLOWED_HOSTS: "auth.example.test",
          CF_ACCESS_CLIENT_ID: "configured-without-secret"
        },
        code: "service_auth_incomplete"
      }
    ]) {
      await assert.rejects(
        requestAuthHubJson({
          ...testCase,
          path: "/api/tasks/example",
          method: "GET",
          token: PROJECT_A_TOKEN,
          fetchImpl
        }),
        (error) => error instanceof ProjectTaskClientError && error.code === testCase.code
      );
    }
    assert.equal(requests, 0);
  });

  it("never follows redirects and never parses their response body", async () => {
    let redirectMode = "";
    const fetchImpl = async (_url, options) => {
      redirectMode = options.redirect;
      return new Response("sensitive redirect body", {
        status: 302,
        headers: { location: "http://127.0.0.1:1/private" }
      });
    };
    await assert.rejects(
      requestAuthHubJson({
        baseUrl: "http://127.0.0.1:12345",
        path: "/api/tasks/example",
        method: "GET",
        token: PROJECT_A_TOKEN,
        fetchImpl
      }),
      (error) => error.code === "redirect_rejected"
    );
    assert.equal(redirectMode, "manual");
  });

  it("bounds polling and reports timeout without an infinite loop", async () => {
    let clock = 0;
    let requests = 0;
    const initialTask = queuedTask("00000000-0000-4000-8000-000000000001");
    const fetchImpl = async () => {
      requests += 1;
      return jsonResponse({ task: initialTask, approvals: [], artifacts: [], auditEvents: [] });
    };
    const result = await waitForProjectTask({
      baseUrl: "http://127.0.0.1:12345",
      token: PROJECT_A_TOKEN,
      taskId: initialTask.id,
      initialTask,
      timeoutMs: 3000,
      intervalMs: 1000,
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      }
    });
    assert.equal(result.poll.timedOut, true);
    assert.equal(result.poll.attempts, 2);
    assert.equal(requests, 2);
  });

  it("returns exit code 4 and ok=false when CLI waiting times out", async () => {
    let clock = 0;
    const rawTask = queuedTask("00000000-0000-4000-8000-000000000002", "timeout-cli-001");
    const stdout = outputBuffer();
    const exitCode = await runProjectTaskCli([
      "submit",
      "--platform", "github",
      "--operation", "check_auth",
      "--request-id", "timeout-cli-001",
      "--github-target-env", "PROJECT_GITHUB_TARGET",
      "--wait",
      "--timeout-ms", "3000",
      "--interval-ms", "1000",
      "--json"
    ], {
      env: {
        AI_LINK_AUTH_HUB_URL: "http://127.0.0.1:12345",
        AI_LINK_PROJECT_TOKEN: PROJECT_A_TOKEN,
        PROJECT_GITHUB_TARGET: "owner/repo"
      },
      stdout,
      fetchImpl: async (_url, options) => jsonResponse(
        options.method === "POST"
          ? { task: rawTask, replayed: false }
          : { task: rawTask, approvals: [], artifacts: [], auditEvents: [] }
      ),
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      }
    });
    const report = JSON.parse(stdout.value);
    assert.equal(exitCode, 4);
    assert.equal(report.ok, false);
    assert.equal(report.poll.timedOut, true);
  });

  it("fails closed on unbound or incomplete terminal responses", async () => {
    const taskId = "00000000-0000-4000-8000-000000000005";
    await assert.rejects(
      requestProjectStatus(taskId, queuedTask("00000000-0000-4000-8000-000000000006")),
      (error) => error.code === "response_binding_failed"
    );
    await assert.rejects(
      requestProjectStatus(taskId, {
        ...queuedTask(taskId),
        status: "completed",
        result: null
      }),
      (error) => error.code === "response_contract_failed"
    );
    await assert.rejects(
      requestProjectStatus(taskId, {
        ...queuedTask(taskId),
        status: "completed",
        result: readyGithubResult(),
        error: { code: "unexpected_error" }
      }),
      (error) => error.code === "response_contract_failed"
    );
  });

  it("does not let direct store callers ignore an idempotency conflict", async () => {
    const store = new MemoryStore();
    const request = {
      workflow: "platform_auth_collect",
      input: {
        platform: "github",
        operation: "check_auth",
        owner: "private-owner",
        repo: "private-repository",
        scope: "repo_read"
      },
      targets: ["github"],
      options: { requestId: "direct-store-conflict-001" },
      createdBy: "project.parentinggame"
    };
    await store.createTask(request);
    await assert.rejects(
      store.createTask({
        ...request,
        input: { ...request.input, scope: "actions_read" }
      }),
      (error) => error.code === "idempotency_conflict"
    );
  });

  it("uses a text-safe PostgreSQL advisory lock key", async () => {
    const expectedFailure = new Error("stop after lock capture");
    let capturedLockKey = "";
    const client = {
      async query(sql, params = []) {
        if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("pg_advisory_xact_lock")) {
          capturedLockKey = params[0];
          throw expectedFailure;
        }
        throw new Error("unexpected query");
      },
      release() {}
    };
    const store = Object.create(PostgresStore.prototype);
    store.pool = { connect: async () => client };

    await assert.rejects(
      store.createTaskIdempotent({
        workflow: "platform_auth_collect",
        input: { platform: "github", operation: "check_auth" },
        targets: ["github"],
        options: { requestId: "postgres-lock-key-001" },
        createdBy: "project.parentinggame"
      }),
      (error) => error === expectedFailure
    );
    assert.match(capturedLockKey, /^[a-f0-9]{64}$/);
    assert.equal(capturedLockKey.includes("\u0000"), false);
  });

  it("reports ready only for a completed matching connector result", async () => {
    const requestId = "ready-cli-001";
    const rawTask = {
      ...queuedTask("00000000-0000-4000-8000-000000000007", requestId),
      status: "completed",
      result: readyGithubResult()
    };
    const stdout = outputBuffer();
    const exitCode = await runProjectTaskCli([
      "submit",
      "--platform", "github",
      "--operation", "check_auth",
      "--request-id", requestId,
      "--github-target-env", "PROJECT_GITHUB_TARGET",
      "--json"
    ], {
      env: {
        AI_LINK_AUTH_HUB_URL: "http://127.0.0.1:12345",
        AI_LINK_PROJECT_TOKEN: PROJECT_A_TOKEN,
        PROJECT_GITHUB_TARGET: "private-owner/private-repository"
      },
      stdout,
      fetchImpl: async () => jsonResponse({ task: rawTask, replayed: false })
    });
    const report = JSON.parse(stdout.value);
    assert.equal(exitCode, 0);
    assert.equal(report.ok, true);
    assert.equal(report.accepted, true);
    assert.equal(report.ready, true);
    assert.equal(report.task.result.status, "ready");
  });

  it("rejects command-specific and duplicate flags before sending a request", async () => {
    let requests = 0;
    for (const argv of [
      ["status", "--task-id", "00000000-0000-4000-8000-000000000003", "--platform", "github", "--json"],
      ["status", "--task-id", "00000000-0000-4000-8000-000000000003", "--task-id", "00000000-0000-4000-8000-000000000004", "--json"]
    ]) {
      const stdout = outputBuffer();
      const exitCode = await runProjectTaskCli(argv, {
        env: {
          AI_LINK_AUTH_HUB_URL: "http://127.0.0.1:12345",
          AI_LINK_PROJECT_TOKEN: PROJECT_A_TOKEN
        },
        stdout,
        fetchImpl: async () => {
          requests += 1;
          throw new Error("unexpected request");
        }
      });
      assert.equal(exitCode, 1);
      assert.equal(JSON.parse(stdout.value).ok, false);
    }
    assert.equal(requests, 0);
  });

  it("rejects oversized success responses without exposing their contents", async () => {
    await assert.rejects(
      requestAuthHubJson({
        baseUrl: "http://127.0.0.1:12345",
        path: "/api/tasks/example",
        method: "GET",
        token: PROJECT_A_TOKEN,
        fetchImpl: async () => new Response(`{"value":"${"x".repeat(600000)}"}`, {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      }),
      (error) => error.code === "response_too_large"
    );
  });
});

function projectConfig() {
  return loadConfig({
    NODE_ENV: "test",
    AI_LINK_APP_PASSWORD: "test-password",
    AI_LINK_SESSION_SECRET: "test-session-secret",
    AI_LINK_ADMIN_TOKEN: "admin-token",
    AI_LINK_EXECUTOR_TOKEN: "executor-token",
    AI_LINK_CODEX_TOKEN: "codex-token",
    AI_LINK_PROJECT_CLIENTS_JSON: JSON.stringify([
      {
        id: "parentinggame",
        tokenEnv: "PROJECT_A_TOKEN",
        operations: ["github/check_auth"],
        githubTargets: [{
          repository: "private-owner/private-repository",
          scopes: ["repo_read", "actions_read"]
        }]
      },
      {
        id: "hermes",
        tokenEnv: "PROJECT_B_TOKEN",
        operations: ["wechat_official/check_health"]
      }
    ]),
    PROJECT_A_TOKEN,
    PROJECT_B_TOKEN
  });
}

async function startTestServer() {
  const { app } = await createApp({
    config: projectConfig(),
    store: new MemoryStore()
  });
  const listener = await new Promise((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  const address = listener.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => listener.close(resolve))
  };
}

async function requestJson(baseUrl, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { response, data: await response.json() };
}

function githubTaskBody(requestId, scope) {
  return {
    workflow: "platform_auth_collect",
    input: {
      platform: "github",
      operation: "check_auth",
      owner: "private-owner",
      repo: "private-repository",
      scope
    },
    options: { requestId }
  };
}

function outputBuffer() {
  return {
    value: "",
    write(chunk) {
      this.value += String(chunk);
    }
  };
}

function queuedTask(id, requestId = "") {
  return {
    id,
    workflow: "platform_auth_collect",
    status: "queued",
    input: { platform: "github", operation: "check_auth" },
    options: requestId ? { requestId } : {},
    platform: "github",
    operation: "check_auth",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
}

function readyGithubResult() {
  return {
    schema_version: "1",
    platform: "github",
    operation: "check_auth",
    status: "ready",
    session: { state: "valid", checked_at: "2026-07-14T00:00:00.000Z" },
    items: [],
    action_required: null,
    diagnostics: { item_count: 0 }
  };
}

function requestProjectStatus(taskId, task) {
  return getProjectTask({
    baseUrl: "http://127.0.0.1:12345",
    token: PROJECT_A_TOKEN,
    taskId,
    fetchImpl: async () => jsonResponse({ task, approvals: [], artifacts: [], auditEvents: [] })
  });
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
