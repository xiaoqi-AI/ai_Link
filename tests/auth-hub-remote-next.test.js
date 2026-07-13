import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const remoteNextScript = fileURLToPath(new URL("../tools/show-auth-hub-remote-next.js", import.meta.url));

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runRemoteNext({ baseUrl, env = {}, args = ["--json"] }) {
  const child = spawn(process.execPath, [remoteNextScript, "--base-url", baseUrl, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const status = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

describe("Auth Hub remote next report", () => {
  it("requires an explicit dedicated Auth Hub URL in the Render blueprint", async () => {
    const blueprint = await readFile(new URL("../render.yaml", import.meta.url), "utf8");

    assert.match(blueprint, /key:\s*AI_LINK_BASE_URL\s+sync:\s*false/);
    assert.equal(blueprint.includes("voice.xiao-qi-ai.com"), false);
  });

  it("reports remote smoke readiness without leaking secret values", async () => {
    await withServer((req, res) => {
      if (req.url === "/healthz") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const env = {
        AI_LINK_BASE_URL: baseUrl,
        AI_LINK_ADMIN_TOKEN: "secret-admin-token",
        AI_LINK_EXECUTOR_TOKEN: "secret-executor-token",
        AI_LINK_EXECUTOR_ID: "local-executor",
        AI_LINK_CODEX_TOKEN: "secret-codex-token",
        AI_LINK_APP_PASSWORD: "secret-app-password",
        AI_LINK_SESSION_SECRET: "secret-session-value",
        AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "true",
        AI_LINK_CLOUDFLARE_ACCESS_AUD: "secret-aud",
        AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com",
        CF_ACCESS_CLIENT_ID: "secret-access-client-id",
        CF_ACCESS_CLIENT_SECRET: "secret-access-client-secret"
      };
      const result = await runRemoteNext({ baseUrl, env });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.remoteReady, true);
      assert.equal(report.summary.smokeReady, true);
      assert.equal(report.summary.blockingCount, 0);
      assert.equal(result.stdout.includes("secret-admin-token"), false);
      assert.equal(result.stdout.includes("secret-access-client-secret"), false);
      assert.ok(report.checks.some((check) => check.name === "remote healthz" && check.status === "pass"));
    });
  });

  it("reports 404 and missing environment markers as manual blockers", async () => {
    await withServer((req, res) => {
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runRemoteNext({
        baseUrl,
        env: {
          AI_LINK_BASE_URL: "",
          AI_LINK_ADMIN_TOKEN: "",
          AI_LINK_EXECUTOR_TOKEN: "",
          AI_LINK_EXECUTOR_ID: "",
          AI_LINK_CODEX_TOKEN: "",
          AI_LINK_APP_PASSWORD: "",
          AI_LINK_SESSION_SECRET: "",
          AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "",
          AI_LINK_CLOUDFLARE_ACCESS_AUD: "",
          CF_ACCESS_CLIENT_ID: "",
          CF_ACCESS_CLIENT_SECRET: ""
        }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.remoteReady, false);
      assert.equal(report.summary.smokeReady, false);
      assert.ok(report.blockers.some((blocker) => blocker.includes("HTTP 404")));
      assert.ok(report.blockers.some((blocker) => blocker.includes("Missing production/smoke environment markers")));
      assert.match(report.summary.recommendedNext, /Configure Render custom domain|health payload/);
    });
  });

  it("renders a public markdown handoff", async () => {
    await withServer((req, res) => {
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runRemoteNext({ baseUrl, args: [] });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /AI Link Auth Hub Remote Next/);
      assert.match(result.stdout, /Remote ready: no/);
      assert.match(result.stdout, /auth-hub:remote:smoke/);
      assert.match(result.stdout, /This report only records whether environment variables are present/);
    });
  });
});
