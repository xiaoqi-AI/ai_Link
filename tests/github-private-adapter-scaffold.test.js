import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPrivateConnectorRegistry } from "../src/connectors/privateLoader.js";
import { describeConnectorRegistry } from "../src/connectors/contracts.js";

const scaffoldScript = fileURLToPath(new URL("../tools/new-github-auth-private-adapter.js", import.meta.url));

async function runScaffold({ cwd = process.cwd(), args = [], env = {} } = {}) {
  const child = spawn(process.execPath, [scaffoldScript, ...args], {
    cwd,
    env: {
      ...process.env,
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
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

async function loadGeneratedGitHubConnector(workspace) {
  const generated = await runScaffold({ cwd: workspace, args: ["--json"] });
  assert.equal(generated.status, 0, generated.stderr);
  const adapterPath = path.join(workspace, "runtime", "private", "github-auth-adapter.mjs");
  const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
  return registry.github;
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("GitHub private auth adapter scaffold", () => {
  it("writes a private adapter under runtime/private and keeps secrets out of output", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--json"],
        env: { GH_TOKEN: "secret-value-that-must-not-print" }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);
      assert.equal(report.summary.output, "runtime/private/github-auth-adapter.mjs");
      assert.equal(result.stdout.includes("secret-value-that-must-not-print"), false);

      const adapterPath = path.join(workspace, "runtime", "private", "github-auth-adapter.mjs");
      const adapterText = await readFile(adapterPath, "utf8");
      assert.match(adapterText, /createPrivateConnectors/);
      assert.match(adapterText, /checkAuth/);

      const registry = await loadPrivateConnectorRegistry({ modulePath: adapterPath, workspaceRoot: workspace });
      const summary = describeConnectorRegistry(registry);
      const github = summary.connectors.find((connector) => connector.platform === "github");
      assert.equal(github.status, "available");
      assert.equal(github.mode, "private");
      assert.ok(github.capabilities.some((capability) => capability.name === "check_auth" && capability.available));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses a distinct read-only endpoint for every supported GitHub scope", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    const previousFetch = globalThis.fetch;
    const previousGhToken = process.env.GH_TOKEN;
    const previousGithubToken = process.env.GITHUB_TOKEN;
    try {
      const connector = await loadGeneratedGitHubConnector(workspace);
      process.env.GH_TOKEN = "test-only-placeholder-token";
      delete process.env.GITHUB_TOKEN;
      const requests = [];
      globalThis.fetch = async (url, options) => {
        const requestUrl = String(url);
        requests.push({ url: requestUrl, options });
        const payload = requestUrl.includes("/actions/runs")
          ? { total_count: 0, workflow_runs: [] }
          : [];
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      };

      const scopes = ["repo_read", "actions_read", "pull_request_read"];
      for (const scope of scopes) {
        const output = await connector.checkAuth({ owner: "xiaoqi-AI", repo: "ai_Link", scope });
        assert.equal(output.status, "ready");
        assert.equal(output.session.state, "valid");
        assert.equal(output.action_required, null);
      }

      assert.deepEqual(requests.map((request) => request.url), [
        "https://api.github.com/repos/xiaoqi-AI/ai_Link/branches?per_page=1",
        "https://api.github.com/repos/xiaoqi-AI/ai_Link/actions/runs?per_page=1",
        "https://api.github.com/repos/xiaoqi-AI/ai_Link/pulls?state=all&per_page=1"
      ]);
      assert.ok(requests.every((request) => request.options.method === "GET"));
      assert.ok(requests.every((request) => request.options.headers.authorization === "Bearer test-only-placeholder-token"));

      const unsupported = await connector.checkAuth({ owner: "xiaoqi-AI", repo: "ai_Link", scope: "admin" });
      assert.equal(unsupported.status, "needs_action");
      assert.equal(unsupported.action_required.code, "connector_contract_failed");
      assert.equal(requests.length, 3);
    } finally {
      globalThis.fetch = previousFetch;
      restoreEnvironment("GH_TOKEN", previousGhToken);
      restoreEnvironment("GITHUB_TOKEN", previousGithubToken);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("classifies GitHub rate limits, authorization failures and platform failures safely", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    const previousFetch = globalThis.fetch;
    const previousGhToken = process.env.GH_TOKEN;
    const previousGithubToken = process.env.GITHUB_TOKEN;
    try {
      const connector = await loadGeneratedGitHubConnector(workspace);
      process.env.GH_TOKEN = "test-only-placeholder-token";
      delete process.env.GITHUB_TOKEN;
      const responses = [
        new Response(null, { status: 401 }),
        new Response(null, {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "retry-after": "120" }
        }),
        new Response(null, { status: 403 }),
        new Response(null, { status: 404 }),
        new Response(null, { status: 429, headers: { "retry-after": "60" } }),
        new Response(null, { status: 503 }),
        new Error("private network detail")
      ];
      globalThis.fetch = async () => {
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      };

      const input = { owner: "xiaoqi-AI", repo: "ai_Link", scope: "actions_read" };
      const unauthorized = await connector.checkAuth(input);
      const rateLimited = await connector.checkAuth(input);
      const forbidden = await connector.checkAuth(input);
      const hiddenRepository = await connector.checkAuth(input);
      const explicitlyRateLimited = await connector.checkAuth(input);
      const unavailable = await connector.checkAuth(input);
      const networkFailure = await connector.checkAuth(input);

      assert.equal(unauthorized.action_required.code, "credential_invalid");
      assert.equal(rateLimited.action_required.code, "platform_rate_limited");
      assert.equal(rateLimited.session.state, "valid");
      assert.equal(rateLimited.diagnostics.retry_after_seconds, 120);
      assert.equal(forbidden.action_required.code, "credential_invalid");
      assert.equal(hiddenRepository.action_required.code, "credential_invalid");
      assert.equal(explicitlyRateLimited.action_required.code, "platform_rate_limited");
      assert.equal(explicitlyRateLimited.diagnostics.retry_after_seconds, 60);
      assert.equal(unavailable.action_required.code, "platform_unavailable");
      assert.equal(networkFailure.action_required.code, "platform_unavailable");
      assert.equal(JSON.stringify(networkFailure).includes("private network detail"), false);
    } finally {
      globalThis.fetch = previousFetch;
      restoreEnvironment("GH_TOKEN", previousGhToken);
      restoreEnvironment("GITHUB_TOKEN", previousGithubToken);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refuses to write outside runtime/private", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--json", "--output", "../github-auth-adapter.mjs"]
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, false);
      assert.ok(report.blockers.some((blocker) => blocker.includes("runtime/private")));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("renders a public handoff without writing when --print is used", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-github-adapter-"));
    try {
      const result = await runScaffold({
        cwd: workspace,
        args: ["--print"],
        env: { GITHUB_TOKEN: "secret-value-that-must-not-print" }
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /GitHub Private Auth Adapter Scaffold/);
      assert.match(result.stdout, /runtime\/private\/github-auth-adapter\.mjs/);
      assert.equal(result.stdout.includes("secret-value-that-must-not-print"), false);
      await assert.rejects(readFile(path.join(workspace, "runtime", "private", "github-auth-adapter.mjs"), "utf8"));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
