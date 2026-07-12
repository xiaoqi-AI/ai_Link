import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { summarizeConnectorAuthStatus } from "../src/connectors/authStatus.js";
import { describeConnectorRegistry } from "../src/connectors/contracts.js";
import { MockWechatConnector } from "../src/connectors/mockWechat.js";
import { loadPrivateConnectorRegistry } from "../src/connectors/privateLoader.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import { runTask } from "../src/executor/runTask.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const scaffoldScript = fileURLToPath(
  new URL("../tools/new-wechat-official-health-private-adapter.js", import.meta.url)
);

async function runScaffold({ cwd = process.cwd(), args = [], env = {} } = {}) {
  const child = spawn(process.execPath, [scaffoldScript, ...args], {
    cwd,
    env: {
      ...process.env,
      WECHAT_OFFICIAL_APP_ID: "",
      WECHAT_OFFICIAL_APP_SECRET: "",
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const status = await new Promise((resolve) => child.on("close", resolve));
  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

async function prepareWorkspace(workspace) {
  const source = await readFile(path.join(repositoryRoot, "src", "connectors", "mockWechat.js"), "utf8");
  const connectorDirectory = path.join(workspace, "src", "connectors");
  await mkdir(connectorDirectory, { recursive: true });
  await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(path.join(connectorDirectory, "mockWechat.js"), source, "utf8");
}

function response({ status = 200, body = {}, headers = {} } = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => normalizedHeaders.get(String(name).toLowerCase()) || null
    },
    json: async () => body
  };
}

async function withOfficialApiFixture(connector, apiResponse, callback = () => {}) {
  const previousAppId = process.env.WECHAT_OFFICIAL_APP_ID;
  const previousSecret = process.env.WECHAT_OFFICIAL_APP_SECRET;
  const previousFetch = globalThis.fetch;
  let request;
  process.env.WECHAT_OFFICIAL_APP_ID = "fixture-app-id";
  process.env.WECHAT_OFFICIAL_APP_SECRET = "fixture-app-value";
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return apiResponse;
  };
  try {
    const result = await connector.checkHealth();
    callback({ result, request });
    return result;
  } finally {
    if (previousAppId === undefined) delete process.env.WECHAT_OFFICIAL_APP_ID;
    else process.env.WECHAT_OFFICIAL_APP_ID = previousAppId;
    if (previousSecret === undefined) delete process.env.WECHAT_OFFICIAL_APP_SECRET;
    else process.env.WECHAT_OFFICIAL_APP_SECRET = previousSecret;
    globalThis.fetch = previousFetch;
  }
}

describe("WeChat Official health private adapter scaffold", () => {
  it("writes only under runtime/private and loads as a partial private capability", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    try {
      await prepareWorkspace(workspace);
      const result = await runScaffold({
        cwd: workspace,
        args: ["--json"],
        env: { WECHAT_OFFICIAL_APP_SECRET: "fixture-value-that-must-not-print" }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);
      assert.equal(report.summary.output, "runtime/private/wechat-official-health-adapter.mjs");
      assert.equal(result.stdout.includes("fixture-value-that-must-not-print"), false);

      const adapterPath = path.join(
        workspace,
        "runtime",
        "private",
        "wechat-official-health-adapter.mjs"
      );
      const adapterText = await readFile(adapterPath, "utf8");
      assert.match(adapterText, /createPrivateConnectors/);
      assert.match(adapterText, /stable_token/);
      assert.equal(adapterText.includes("fixture-value-that-must-not-print"), false);

      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      const summary = describeConnectorRegistry(registry);
      const wechat = summary.connectors.find((connector) => connector.platform === "wechat_official");
      assert.equal(wechat.status, "available");
      assert.equal(wechat.mode, "private");
      assert.equal(
        wechat.capabilities.find((capability) => capability.name === "check_health")?.mode,
        "private"
      );
      assert.equal(
        wechat.capabilities.find((capability) => capability.name === "create_draft")?.mode,
        "mock"
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refuses to write outside runtime/private", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--json", "--output", "../wechat-official-health-adapter.mjs"]
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, false);
      assert.ok(report.blockers.some((blocker) => blocker.includes("runtime/private")));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("loads correctly when generated in a nested runtime/private directory", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    try {
      await prepareWorkspace(workspace);
      const output = "runtime/private/platforms/wechat-official-health-adapter.mjs";
      const result = await runScaffold({ cwd: workspace, args: ["--json", "--output", output] });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);
      const modulePath = path.join(workspace, ...output.split("/"));
      const registry = await loadPrivateConnectorRegistry({ modulePath, workspaceRoot: workspace });
      const summary = describeConnectorRegistry(registry);
      const wechat = summary.connectors.find((connector) => connector.platform === "wechat_official");
      assert.equal(wechat.status, "available");
      assert.equal(wechat.mode, "private");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("renders a safe handoff without writing when --print is used", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--print"],
        env: { WECHAT_OFFICIAL_APP_SECRET: "fixture-value-that-must-not-print" }
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /WeChat Official Health Adapter Scaffold/);
      assert.match(result.stdout, /runtime\/private\/wechat-official-health-adapter\.mjs/);
      assert.equal(result.stdout.includes("fixture-value-that-must-not-print"), false);
      await assert.rejects(
        readFile(path.join(workspace, "runtime", "private", "wechat-official-health-adapter.mjs"), "utf8")
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not call the official API when credentials are missing", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    const previousFetch = globalThis.fetch;
    const previousAppId = process.env.WECHAT_OFFICIAL_APP_ID;
    const previousSecret = process.env.WECHAT_OFFICIAL_APP_SECRET;
    try {
      await prepareWorkspace(workspace);
      await runScaffold({ cwd: workspace, args: ["--json"] });
      const modulePath = path.join(workspace, "runtime", "private", "wechat-official-health-adapter.mjs");
      const module = await import(`${pathToFileURL(modulePath).href}?missing=1`);
      const connectors = await module.createPrivateConnectors();
      let called = false;
      globalThis.fetch = async () => {
        called = true;
        throw new Error("must not be called");
      };
      delete process.env.WECHAT_OFFICIAL_APP_ID;
      delete process.env.WECHAT_OFFICIAL_APP_SECRET;

      const result = await connectors.wechat_official.checkHealth();
      assert.equal(called, false);
      assert.equal(result.status, "needs_action");
      assert.equal(result.action_required.code, "credential_missing");
    } finally {
      globalThis.fetch = previousFetch;
      if (previousAppId === undefined) delete process.env.WECHAT_OFFICIAL_APP_ID;
      else process.env.WECHAT_OFFICIAL_APP_ID = previousAppId;
      if (previousSecret === undefined) delete process.env.WECHAT_OFFICIAL_APP_SECRET;
      else process.env.WECHAT_OFFICIAL_APP_SECRET = previousSecret;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discards access tokens and maps official API responses to stable public codes", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    try {
      await prepareWorkspace(workspace);
      await runScaffold({ cwd: workspace, args: ["--json"] });
      const modulePath = path.join(workspace, "runtime", "private", "wechat-official-health-adapter.mjs");
      const module = await import(`${pathToFileURL(modulePath).href}?mapping=1`);
      const connectors = await module.createPrivateConnectors();
      const connector = connectors.wechat_official;

      const ready = await withOfficialApiFixture(
        connector,
        response({ body: { access_token: "fixture-response-value", expires_in: 7200 } }),
        ({ request }) => {
          assert.equal(request.url, "https://api.weixin.qq.com/cgi-bin/stable_token");
          assert.equal(request.options.method, "POST");
          assert.equal(JSON.parse(request.options.body).appid, "fixture-app-id");
          assert.equal(JSON.parse(request.options.body).secret, "fixture-app-value");
        }
      );
      assert.equal(ready.status, "ready");
      assert.equal(JSON.stringify(ready).includes("fixture-response-value"), false);

      const cases = [
        [40013, "credential_invalid"],
        [40125, "credential_invalid"],
        [40164, "official_api_ip_not_whitelisted"],
        [45009, "official_api_rate_limited"],
        [99999, "official_api_unavailable"]
      ];
      for (const [errcode, expected] of cases) {
        const result = await withOfficialApiFixture(connector, response({ body: { errcode, errmsg: "private" } }));
        assert.equal(result.status, "needs_action");
        assert.equal(result.action_required.code, expected);
        assert.equal(JSON.stringify(result).includes("errmsg"), false);
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces rate limits and official outages as Auth Hub next actions", () => {
    for (const [code, title] of [
      ["official_api_rate_limited", "公众号 API 正在限流"],
      ["official_api_unavailable", "公众号 API 暂不可用"]
    ]) {
      const report = summarizeConnectorAuthStatus({
        connectors: [{ platform: "wechat_official", status: "available", mode: "private", issues: [] }],
        actionTasks: [{
          id: `task-${code}`,
          status: "needs_action",
          input: { platform: "wechat_official" },
          error: { platform: "wechat_official", code }
        }]
      });
      assert.equal(report.summary.next_actions, 1);
      assert.equal(report.nextActions[0].reason, code);
      assert.equal(report.nextActions[0].title, title);
      assert.equal(report.nextActions[0].owner, "maintainer");
      assert.equal(report.nextActions[0].retryAfterAction, true);
    }
  });

  it("routes a generated adapter result through platform_auth_collect without leaking raw details", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-wechat-adapter-"));
    const previousAppId = process.env.WECHAT_OFFICIAL_APP_ID;
    const previousSecret = process.env.WECHAT_OFFICIAL_APP_SECRET;
    const previousFetch = globalThis.fetch;
    try {
      await prepareWorkspace(workspace);
      await runScaffold({ cwd: workspace, args: ["--json"] });
      const modulePath = path.join(workspace, "runtime", "private", "wechat-official-health-adapter.mjs");
      const registry = await loadPrivateConnectorRegistry({ modulePath, workspaceRoot: workspace });
      process.env.WECHAT_OFFICIAL_APP_ID = "fixture-app-id";
      process.env.WECHAT_OFFICIAL_APP_SECRET = "fixture-app-value";
      globalThis.fetch = async () => response({
        body: {
          errcode: 40164,
          errmsg: "private platform response must not escape"
        }
      });

      const result = await runTask({
        workflow: "platform_auth_collect",
        input: {
          platform: "wechat_official",
          operation: "check_health"
        }
      }, { registry });

      assert.equal(result.status, "needs_action");
      assert.equal(result.error.code, "official_api_ip_not_whitelisted");
      assert.equal(result.error.platform, "wechat_official");
      assert.equal(JSON.stringify(result).includes("private platform response"), false);
    } finally {
      if (previousAppId === undefined) delete process.env.WECHAT_OFFICIAL_APP_ID;
      else process.env.WECHAT_OFFICIAL_APP_ID = previousAppId;
      if (previousSecret === undefined) delete process.env.WECHAT_OFFICIAL_APP_SECRET;
      else process.env.WECHAT_OFFICIAL_APP_SECRET = previousSecret;
      globalThis.fetch = previousFetch;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps a thrown official outage retryable instead of closing the task as failed", async () => {
    const connector = new MockWechatConnector();
    connector.mode = "private";
    connector.checkHealth = async () => {
      throw Object.assign(new Error("private failure detail"), {
        code: "official_api_unavailable",
        platform: "wechat_official"
      });
    };
    const registry = createConnectorRegistry({
      privateConnectors: {
        wechat_official: connector
      }
    });

    const result = await runTask({
      workflow: "platform_auth_collect",
      input: {
        platform: "wechat_official",
        operation: "check_health"
      }
    }, { registry });

    assert.equal(result.status, "needs_action");
    assert.equal(result.error.code, "official_api_unavailable");
    assert.equal(result.error.retryable, true);
    assert.equal(JSON.stringify(result).includes("private failure detail"), false);
  });
});
