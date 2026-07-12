import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPrivateConnectorRegistry } from "../src/connectors/privateLoader.js";
import { summarizeConnectorAuthStatus } from "../src/connectors/authStatus.js";
import { describeConnectorRegistry } from "../src/connectors/contracts.js";
import { runTask } from "../src/executor/runTask.js";

const scaffoldScript = fileURLToPath(
  new URL("../tools/new-xiaohongshu-readonly-private-adapter.js", import.meta.url)
);

async function runScaffold({ cwd = process.cwd(), args = [], env = {} } = {}) {
  const child = spawn(process.execPath, [scaffoldScript, ...args], {
    cwd,
    env: {
      ...process.env,
      AI_LINK_XHS_READONLY_BRIDGE: "",
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
  await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n', "utf8");
  const generated = await runScaffold({ cwd: workspace, args: ["--json"] });
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(JSON.parse(generated.stdout).summary.written, true);
}

async function writeBridge(workspace, source) {
  const bridgePath = path.join(workspace, "runtime", "private", "xiaohongshu-readonly-bridge.mjs");
  await writeFile(bridgePath, source, "utf8");
  return bridgePath;
}

async function withBridgeEnv(bridgePath, callback, { timeoutMs = "5000" } = {}) {
  const previousBridge = process.env.AI_LINK_XHS_READONLY_BRIDGE;
  const previousTimeout = process.env.AI_LINK_XHS_READONLY_TIMEOUT_MS;
  process.env.AI_LINK_XHS_READONLY_BRIDGE = bridgePath;
  process.env.AI_LINK_XHS_READONLY_TIMEOUT_MS = timeoutMs;
  try {
    return await callback();
  } finally {
    if (previousBridge === undefined) delete process.env.AI_LINK_XHS_READONLY_BRIDGE;
    else process.env.AI_LINK_XHS_READONLY_BRIDGE = previousBridge;
    if (previousTimeout === undefined) delete process.env.AI_LINK_XHS_READONLY_TIMEOUT_MS;
    else process.env.AI_LINK_XHS_READONLY_TIMEOUT_MS = previousTimeout;
  }
}

const bridgeFixture = `import { readFileSync, writeFileSync } from "node:fs";

const request = JSON.parse(readFileSync(0, "utf8"));
let response;
if (request.operation === "check_session") {
  response = { ok: true, schema_version: "1", data: { authenticated: true } };
} else if (request.operation === "begin_login") {
  if (process.env.XHS_TEST_MARKER) writeFileSync(process.env.XHS_TEST_MARKER, "called", "utf8");
  response = { ok: true, schema_version: "1", data: { login_started: true } };
} else if (request.operation === "search_content") {
  response = {
    ok: true,
    schema_version: "1",
    data: {
      items: [
        {
          id: "66abcdef1234567890abcdef",
          xsec_token: "private-xsec-token",
          note_card: {
            display_title: "AI Agent 实测",
            desc: "一条具体的小红书笔记",
            user: { nickname: "private-account" }
          }
        },
        { id: "bad/id", note_card: { display_title: "invalid" } }
      ]
    }
  };
} else {
  response = { ok: false, schema_version: "1", error: { code: "not_authenticated" } };
}
console.log(JSON.stringify(response));
`;

describe("Xiaohongshu read-only private adapter scaffold", () => {
  it("writes only under runtime/private and registers all required read-only capabilities", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    try {
      await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n', "utf8");
      const generated = await runScaffold({ cwd: workspace, args: ["--json"] });
      const report = JSON.parse(generated.stdout);

      assert.equal(generated.status, 0, generated.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);
      assert.equal(report.summary.output, "runtime/private/xiaohongshu-readonly-adapter.mjs");

      const adapterPath = path.join(
        workspace,
        "runtime",
        "private",
        "xiaohongshu-readonly-adapter.mjs"
      );
      const adapterText = await readFile(adapterPath, "utf8");
      assert.match(adapterText, /shell: false/);
      assert.match(adapterText, /checkSession/);
      assert.match(adapterText, /beginLogin/);
      assert.match(adapterText, /readContent/);
      assert.doesNotMatch(adapterText, /\b(?:like|comment|follow|publish)\s*:/i);

      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      const summary = describeConnectorRegistry(registry);
      const xhs = summary.connectors.find((connector) => connector.platform === "xiaohongshu");
      assert.equal(xhs.status, "available");
      assert.equal(xhs.mode, "private");
      for (const capability of ["check_session", "begin_login", "read_content"]) {
        assert.equal(xhs.capabilities.find((item) => item.name === capability)?.available, true);
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("maps an authenticated session and strips private search fields from concrete note results", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    try {
      await prepareWorkspace(workspace);
      const bridgePath = await writeBridge(workspace, bridgeFixture);
      const adapterPath = path.join(workspace, "runtime", "private", "xiaohongshu-readonly-adapter.mjs");
      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });

      await withBridgeEnv(bridgePath, async () => {
        const session = await runTask({
          workflow: "platform_auth_collect",
          input: { platform: "xiaohongshu", operation: "check_session" }
        }, { registry });
        assert.equal(session.status, "completed");
        assert.equal(session.result.session.state, "valid");

        const search = await runTask({
          workflow: "platform_auth_collect",
          input: {
            platform: "xiaohongshu",
            operation: "search_content",
            query: "AI Agent",
            limit: 4
          }
        }, { registry });
        assert.equal(search.status, "completed");
        assert.equal(search.result.items.length, 1);
        assert.equal(
          search.result.items[0].source_url,
          "https://www.xiaohongshu.com/explore/66abcdef1234567890abcdef"
        );
        assert.equal(search.result.items[0].acquisition_provider, "ai_link_xhs_readonly");
        assert.equal(search.result.items[0].source_reachability.status, "verified");
        const serialized = JSON.stringify(search);
        assert.equal(serialized.includes("private-xsec-token"), false);
        assert.equal(serialized.includes("private-account"), false);
        assert.equal(serialized.includes("xsec_token"), false);
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resolves the private root correctly from a nested generated adapter", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    try {
      await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n', "utf8");
      const output = "runtime/private/platforms/xiaohongshu-readonly-adapter.mjs";
      const generated = await runScaffold({ cwd: workspace, args: ["--json", "--output", output] });
      assert.equal(generated.status, 0, generated.stderr);
      assert.equal(JSON.parse(generated.stdout).summary.written, true);

      const bridgePath = await writeBridge(workspace, bridgeFixture);
      const registry = await loadPrivateConnectorRegistry({
        modulePath: path.join(workspace, ...output.split("/")),
        workspaceRoot: workspace
      });
      await withBridgeEnv(bridgePath, async () => {
        const result = await runTask({
          workflow: "platform_auth_collect",
          input: { platform: "xiaohongshu", operation: "check_session" }
        }, { registry });
        assert.equal(result.status, "completed");
        assert.equal(result.result.session.state, "valid");
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not invoke begin_login before Auth Hub approval", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    const previousMarker = process.env.XHS_TEST_MARKER;
    try {
      await prepareWorkspace(workspace);
      const bridgePath = await writeBridge(workspace, bridgeFixture);
      const markerPath = path.join(workspace, "begin-login-called.txt");
      const adapterPath = path.join(workspace, "runtime", "private", "xiaohongshu-readonly-adapter.mjs");
      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      process.env.XHS_TEST_MARKER = markerPath;

      await withBridgeEnv(bridgePath, async () => {
        const approval = await runTask({
          workflow: "platform_auth_collect",
          input: { platform: "xiaohongshu", operation: "begin_login" }
        }, { registry });
        assert.equal(approval.status, "needs_approval");
        assert.equal(approval.approval.nextStep, "platform_interactive_login");
        await assert.rejects(access(markerPath));

        const approved = await runTask({
          workflow: "platform_auth_collect",
          currentStep: "platform_interactive_login",
          input: { platform: "xiaohongshu", operation: "begin_login" }
        }, { registry });
        assert.equal(approved.status, "needs_action");
        assert.equal(approved.error.code, "login_required");
        assert.equal(await readFile(markerPath, "utf8"), "called");
      });
    } finally {
      if (previousMarker === undefined) delete process.env.XHS_TEST_MARKER;
      else process.env.XHS_TEST_MARKER = previousMarker;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails closed for a missing, outside, malformed or non-zero bridge", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    const outside = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-outside-"));
    try {
      await prepareWorkspace(workspace);
      const adapterPath = path.join(workspace, "runtime", "private", "xiaohongshu-readonly-adapter.mjs");
      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      const task = {
        workflow: "platform_auth_collect",
        input: { platform: "xiaohongshu", operation: "check_session" }
      };

      await withBridgeEnv(path.join(workspace, "runtime", "private", "missing.mjs"), async () => {
        const result = await runTask(task, { registry });
        assert.equal(result.status, "failed");
        assert.equal(result.error.code, "connector_missing");
      });

      const outsideBridge = path.join(outside, "outside.mjs");
      await writeFile(outsideBridge, 'console.log("private outside output")\n', "utf8");
      await withBridgeEnv(outsideBridge, async () => {
        const result = await runTask(task, { registry });
        assert.equal(result.status, "failed");
        assert.equal(result.error.code, "connector_contract_failed");
        assert.equal(JSON.stringify(result).includes("private outside output"), false);
      });

      const malformedBridge = await writeBridge(
        workspace,
        'console.log("private malformed output that must not escape")\n'
      );
      await withBridgeEnv(malformedBridge, async () => {
        const result = await runTask(task, { registry });
        assert.equal(result.status, "failed");
        assert.equal(result.error.code, "connector_contract_failed");
        assert.equal(JSON.stringify(result).includes("private malformed output"), false);
      });

      const nonZeroBridge = await writeBridge(
        workspace,
        'console.log(JSON.stringify({ok:true,status:"ready",session:{state:"valid",checked_at:new Date().toISOString()},items:[]})); process.exit(1);\n'
      );
      await withBridgeEnv(nonZeroBridge, async () => {
        const result = await runTask(task, { registry });
        assert.equal(result.status, "failed");
        assert.equal(result.error.code, "connector_contract_failed");
      });

      const oversizedBridge = await writeBridge(
        workspace,
        'process.stdout.write("x".repeat(200000));\n'
      );
      await withBridgeEnv(oversizedBridge, async () => {
        const result = await runTask(task, { registry });
        assert.equal(result.status, "failed");
        assert.equal(result.error.code, "connector_contract_failed");
        assert.equal(JSON.stringify(result).includes("xxxxxxxx"), false);
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("kills a timed-out bridge and returns a retryable platform action", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    try {
      await prepareWorkspace(workspace);
      const bridgePath = await writeBridge(
        workspace,
        'setTimeout(() => console.log(JSON.stringify({ok:true,data:{authenticated:true}})), 10000);\n'
      );
      const adapterPath = path.join(workspace, "runtime", "private", "xiaohongshu-readonly-adapter.mjs");
      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      const startedAt = Date.now();
      await withBridgeEnv(bridgePath, async () => {
        const result = await runTask({
          workflow: "platform_auth_collect",
          input: { platform: "xiaohongshu", operation: "check_session" }
        }, { registry });
        assert.equal(result.status, "needs_action");
        assert.equal(result.error.code, "platform_unavailable");
        assert.equal(result.error.retryable, true);
      }, { timeoutMs: "1000" });
      assert.ok(Date.now() - startedAt < 5000);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refuses output outside runtime/private and prints a safe handoff without writing", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-xhs-adapter-"));
    try {
      const outside = await runScaffold({
        cwd: workspace,
        args: ["--json", "--output", "../xiaohongshu-readonly-adapter.mjs"]
      });
      const outsideReport = JSON.parse(outside.stdout);
      assert.equal(outside.status, 0, outside.stderr);
      assert.equal(outsideReport.summary.ok, false);
      assert.ok(outsideReport.blockers.some((item) => item.includes("runtime/private")));

      const printed = await runScaffold({
        cwd: workspace,
        args: ["--print"],
        env: { XHS_PRIVATE_VALUE: "secret-value-that-must-not-print" }
      });
      assert.equal(printed.status, 0, printed.stderr);
      assert.match(printed.stdout, /Xiaohongshu Read-only Private Adapter Scaffold/);
      assert.equal(printed.stdout.includes("secret-value-that-must-not-print"), false);
      await assert.rejects(
        access(path.join(workspace, "runtime", "private", "xiaohongshu-readonly-adapter.mjs"))
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces a temporary bridge outage as a retryable Auth Hub action", () => {
    const cases = [
      ["platform_unavailable", "平台只读连接暂不可用", "maintainer"],
      ["specific_content_missing", "需要更具体的搜索词", "task_owner"]
    ];
    for (const [code, title, owner] of cases) {
      const report = summarizeConnectorAuthStatus({
        connectors: [{ platform: "xiaohongshu", status: "available", mode: "private", issues: [] }],
        actionTasks: [{
          id: `task-xhs-${code}`,
          status: "needs_action",
          input: { platform: "xiaohongshu" },
          error: { platform: "xiaohongshu", code }
        }]
      });

      assert.equal(report.summary.next_actions, 1);
      assert.equal(report.nextActions[0].title, title);
      assert.equal(report.nextActions[0].owner, owner);
      assert.equal(report.nextActions[0].retryAfterAction, true);
    }
  });
});
