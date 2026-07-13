import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareServiceHeaders, validateServiceAuthTarget } from "../tools/auth-hub-remote-safety.js";

const remoteNextScript = fileURLToPath(new URL("../tools/show-auth-hub-remote-next.js", import.meta.url));
const remoteSmokeScript = fileURLToPath(new URL("../tools/test-auth-hub-remote.ps1", import.meta.url));
const deploymentCheckScript = fileURLToPath(new URL("../tools/check-auth-hub-deployment.ps1", import.meta.url));
const executorStartScript = fileURLToPath(new URL("../tools/start-auth-hub-executor.ps1", import.meta.url));
const executorProcessStatePath = fileURLToPath(new URL("../runtime/tmp/auth-hub-executor-process.json", import.meta.url));
const powershellCommand = process.platform === "win32" ? "powershell.exe" : "pwsh";

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

async function runPowerShell(script, args = [], env = {}) {
  const child = spawn(powershellCommand, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    ...args
  ], {
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
  const status = await new Promise((resolve) => child.on("close", resolve));
  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

async function withApprovedRenderYaml(fn) {
  const directory = await mkdtemp(join(tmpdir(), "ai-link-render-"));
  const path = join(directory, "render.yaml");
  const current = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
  const approved = current
    .replace(/(\s+runtime:\s*node\r?\n)/, "$1    region: singapore\n    domains:\n      - auth.xiao-qi-ai.com\n    renderSubdomainPolicy: disabled\n")
    .replace(/(databases:\r?\n\s+- name:\s*ai-link-postgres\r?\n)/, "$1    region: singapore\n");
  await writeFile(path, approved, "utf8");
  try {
    return await fn(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Auth Hub remote next report", () => {
  it("requires an explicit dedicated Auth Hub URL in the Render blueprint", async () => {
    const blueprint = await readFile(new URL("../render.yaml", import.meta.url), "utf8");

    assert.match(blueprint, /key:\s*AI_LINK_BASE_URL\s+sync:\s*false/);
    assert.match(blueprint, /key:\s*AI_LINK_SESSION_MAX_AGE_SECONDS\s+value:\s*"28800"/);
    assert.match(blueprint, /key:\s*AI_LINK_CSRF_TOKEN_TTL_SECONDS\s+value:\s*"900"/);
    assert.match(blueprint, /key:\s*AI_LINK_LOGIN_MAX_FAILURES\s+value:\s*"5"/);
    assert.match(blueprint, /key:\s*AI_LINK_LOGIN_WINDOW_SECONDS\s+value:\s*"900"/);
    assert.match(blueprint, /key:\s*AI_LINK_LOGIN_BLOCK_SECONDS\s+value:\s*"900"/);
    assert.match(blueprint, /key:\s*AI_LINK_LOGIN_MAX_KEYS\s+value:\s*"1000"/);
    assert.match(blueprint, /key:\s*AI_LINK_CODEX_SCOPES\s+value:\s*"tasks:create,tasks:read,connectors:read,connectors:verify-target,audit:write"/);
    assert.match(blueprint, /numInstances:\s*1/);
    assert.match(blueprint, /autoDeployTrigger:\s*checksPass/);
    assert.match(blueprint, /key:\s*AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN\s+sync:\s*false/);
    assert.match(blueprint, /databases:\s+[\s\S]*?plan:\s*basic-256mb/);
    assert.match(blueprint, /databases:\s+[\s\S]*?ipAllowList:\s*\[\]/);
    assert.doesNotMatch(blueprint, /renderSubdomainPolicy:\s*disabled/);
    assert.doesNotMatch(blueprint, /region:\s*[a-z0-9-]+/);
    assert.equal(blueprint.includes("voice.xiao-qi-ai.com"), false);
  });

  it("fails remote smoke closed when critical credentials are omitted", async () => {
    const [smoke, deploymentCheck, packageJson, executorStart] = await Promise.all([
      readFile(remoteSmokeScript, "utf8"),
      readFile(deploymentCheckScript, "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(executorStartScript, "utf8")
    ]);

    assert.match(smoke, /AI_LINK_PRIVATE_CONNECTOR_MODULE\s*=\s*""/);
    assert.match(smoke, /Add-Check "app login" "fail" "App password is required/);
    assert.match(smoke, /Add-Check "codex token boundary" "fail" "Restricted Codex token is required/);
    assert.match(smoke, /Add-Check "api token" "fail" "Admin token is required/);
    assert.match(deploymentCheck, /"DATABASE_URL"/);
    assert.match(deploymentCheck, /Render Postgres plan/);
    assert.match(deploymentCheck, /Render Postgres public access/);
    assert.match(deploymentCheck, /Render web instances/);
    const requiredEnvBlock = deploymentCheck.match(/\$requiredEnv = @\(([\s\S]*?)\r?\n\)/)?.[1] ?? "";
    const optionalEnvBlock = deploymentCheck.match(/\$optionalEnv = @\(([\s\S]*?)\r?\n\)/)?.[1] ?? "";
    assert.match(requiredEnvBlock, /"AI_LINK_CODEX_TOKEN"/);
    assert.doesNotMatch(optionalEnvBlock, /"AI_LINK_CODEX_TOKEN"/);
    assert.match(smoke, /Get-CloudflareAccessGateEvidence/);
    assert.doesNotMatch(smoke, /\$login\.statusCode -in @\(302, 401, 403\)/);
    assert.match(smoke, /cloudflare access verification required/);
    assert.match(smoke, /\[switch\]\$AccessGateOnly/);
    assert.match(smoke, /Service Auth cannot prove browser login/);
    assert.doesNotMatch(smoke, /Invoke-WebRequest/);
    assert.match(smoke, /AllowAutoRedirect = \$false/);
    assert.match(smoke, /Login redirect must remain on the approved Auth Hub origin/);
    const scripts = JSON.parse(packageJson).scripts;
    assert.match(scripts["auth-hub:remote:smoke"], /-SkipAppLogin/);
    assert.match(scripts["auth-hub:remote:smoke"], /-ExpectAccessGate/);
    assert.ok(executorStart.indexOf("$env:AI_LINK_BASE_URL") < executorStart.indexOf("Test-Path -LiteralPath $hubStatePath"));
    assert.match(executorStart, /required for a remote HTTPS executor/);
    assert.match(executorStart, /already running for a different target/);
    assert.match(executorStart, /\$existingBaseUrl -ne \$requestedBaseUrl -or \$existingExecutorId -ne \$ExecutorId/);
  });

  it("reports remote smoke readiness without leaking secret values", async () => {
    await withApprovedRenderYaml(async (renderYaml) => withServer((req, res) => {
      if (req.url === "/healthz") {
        assert.equal(req.headers["cf-access-client-id"], undefined);
        assert.equal(req.headers["cf-access-client-secret"], undefined);
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
        AI_LINK_CLOUDFLARE_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
        AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com",
        AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN: "true",
        CF_ACCESS_CLIENT_ID: "secret-access-client-id",
        CF_ACCESS_CLIENT_SECRET: "secret-access-client-secret"
      };
      const result = await runRemoteNext({
        baseUrl,
        env,
        args: ["--json", "--render-yaml", renderYaml]
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.remoteReady, true);
      assert.equal(report.summary.smokeReady, true);
      assert.equal(report.summary.deploymentDecisionStatus, "encoded");
      assert.equal(report.summary.blockingCount, 0);
      assert.equal(result.stdout.includes("secret-admin-token"), false);
      assert.equal(result.stdout.includes("secret-access-client-secret"), false);
      assert.ok(report.checks.some((check) => check.name === "remote healthz" && check.status === "pass"));
      assert.ok(report.checks.some((check) => check.name === "Cloudflare Access verification" && check.status === "pass"));
      assert.ok(report.checks.some((check) => check.name === "Service Auth target" && check.status === "pass"));
    }));
  });

  it("keeps the current Blueprint no-go until region and domain decisions are encoded", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
    }, async (baseUrl) => {
      const result = await runRemoteNext({ baseUrl });
      const report = JSON.parse(result.stdout);
      const renderCheck = report.checks.find((check) => check.name === "render blueprint");

      assert.equal(result.status, 0, result.stderr);
      assert.equal(renderCheck.status, "manual");
      assert.match(renderCheck.detail, /region decision/);
      assert.match(renderCheck.detail, /renderSubdomainPolicy:disabled/);
      assert.match(renderCheck.detail, /domains:auth\.xiao-qi-ai\.com/);
      assert.equal(report.summary.smokeReady, false);
      assert.equal(report.summary.deploymentDecisionStatus, "pending");
      assert.equal(report.deploymentDecision.status, "pending");
      assert.match(report.summary.recommendedNext, /Approve the Auth Hub deployment decision card/);
      assert.ok(report.blockers.some((blocker) => blocker.includes("do not create remote resources")));
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
          AI_LINK_CLOUDFLARE_TEAM_DOMAIN: "",
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
      assert.match(report.summary.recommendedNext, /deployment decision card|Configure Render custom domain|health payload/);
    });
  });

  it("does not report smoke readiness when the Access origin guard is disabled", async () => {
    await withServer((req, res) => {
      if (req.url === "/healthz") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runRemoteNext({
        baseUrl,
        env: {
          AI_LINK_BASE_URL: baseUrl,
          AI_LINK_ADMIN_TOKEN: "test-disabled-guard-admin-token",
          AI_LINK_EXECUTOR_TOKEN: "test-disabled-guard-executor-token",
          AI_LINK_EXECUTOR_ID: "local-executor",
          AI_LINK_CODEX_TOKEN: "test-disabled-guard-codex-token",
          AI_LINK_APP_PASSWORD: "test-disabled-guard-password",
          AI_LINK_SESSION_SECRET: "test-disabled-guard-session-secret",
          AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "false",
          AI_LINK_CLOUDFLARE_ACCESS_AUD: "test-disabled-guard-aud",
          AI_LINK_CLOUDFLARE_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
          AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com",
          AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN: "true",
          CF_ACCESS_CLIENT_ID: "test-disabled-guard-client-id",
          CF_ACCESS_CLIENT_SECRET: "test-disabled-guard-client-secret"
        }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.remoteReady, true);
      assert.equal(report.summary.smokeReady, false);
      assert.ok(report.blockers.some((blocker) => blocker.includes("must be true")));
    });
  });

  it("does not follow health redirects or forward Service Auth credentials on loopback", async () => {
    let redirectedRequests = 0;
    await withServer((req, res) => {
      redirectedRequests += 1;
      res.statusCode = 200;
      res.end("unexpected redirect follow");
    }, async (redirectTarget) => {
      await withServer((req, res) => {
        assert.equal(req.headers["cf-access-client-id"], undefined);
        assert.equal(req.headers["cf-access-client-secret"], undefined);
        res.statusCode = 302;
        res.setHeader("location", `${redirectTarget}/capture`);
        res.end();
      }, async (baseUrl) => {
        const result = await runRemoteNext({
          baseUrl,
          env: {
            AI_LINK_BASE_URL: baseUrl,
            CF_ACCESS_CLIENT_ID: "must-not-forward-client-id",
            CF_ACCESS_CLIENT_SECRET: "must-not-forward-client-secret"
          }
        });
        const report = JSON.parse(result.stdout);

        assert.equal(result.status, 0, result.stderr);
        assert.equal(report.summary.remoteReady, false);
        assert.equal(redirectedRequests, 0);
      });
    });
  });

  it("does not attach Service Auth credentials to an unapproved non-HTTPS host", async () => {
    const server = http.createServer((req, res) => {
      assert.equal(req.headers["cf-access-client-id"], undefined);
      assert.equal(req.headers["cf-access-client-secret"], undefined);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
    });
    await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
    const { port } = server.address();
    try {
      const result = await runRemoteNext({
        baseUrl: `http://0.0.0.0:${port}`,
        env: {
          CF_ACCESS_CLIENT_ID: "must-not-send-client-id",
          CF_ACCESS_CLIENT_SECRET: "must-not-send-client-secret"
        }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.remoteReady, true);
      assert.equal(report.summary.smokeReady, false);
      assert.ok(report.checks.some((check) => check.name === "Service Auth target" && check.status === "fail"));
      assert.equal(result.stdout.includes("must-not-send-client-secret"), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("independently requires an approved hostname and HTTPS before attaching Service Auth", () => {
    const credentials = {
      clientId: "test-client-id",
      clientSecret: "test-client-secret"
    };
    const unapprovedHttps = validateServiceAuthTarget("https://not-approved.example.test", { allowedHosts: "" });
    const implicitRecommendation = validateServiceAuthTarget("https://auth.xiao-qi-ai.com", { allowedHosts: "" });
    const approvedHttp = validateServiceAuthTarget("http://auth.xiao-qi-ai.com", { allowedHosts: "auth.xiao-qi-ai.com" });
    const approvedHttps = validateServiceAuthTarget("https://auth.xiao-qi-ai.com", { allowedHosts: "auth.xiao-qi-ai.com" });

    assert.equal(unapprovedHttps.ok, false);
    assert.equal(unapprovedHttps.attachServiceHeaders, false);
    assert.deepEqual(cloudflareServiceHeaders(unapprovedHttps, credentials), {});
    assert.equal(implicitRecommendation.ok, false);
    assert.deepEqual(cloudflareServiceHeaders(implicitRecommendation, credentials), {});
    assert.equal(approvedHttp.ok, false);
    assert.equal(approvedHttp.attachServiceHeaders, false);
    assert.deepEqual(cloudflareServiceHeaders(approvedHttp, credentials), {});
    assert.equal(approvedHttps.ok, true);
    assert.equal(approvedHttps.attachServiceHeaders, true);
    assert.deepEqual(cloudflareServiceHeaders(approvedHttps, credentials), {
      "CF-Access-Client-Id": "test-client-id",
      "CF-Access-Client-Secret": "test-client-secret"
    });
  });

  it("requires AccessGateOnly to prove a Cloudflare Access edge decision", async () => {
    const misuse = await runPowerShell(remoteSmokeScript, [
      "-BaseUrl", "http://127.0.0.1:1",
      "-AccessGateOnly"
    ]);
    assert.equal(misuse.status, 1);
    assert.match(`${misuse.stdout}\n${misuse.stderr}`, /requires -ExpectAccessGate/);

    await withServer((req, res) => {
      if (req.url === "/healthz") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
        return;
      }
      res.statusCode = 403;
      res.setHeader("CF-Ray", "test-origin-guard");
      res.end("Cloudflare Access verification required.");
    }, async (baseUrl) => {
      const negative = await runPowerShell(remoteSmokeScript, [
        "-BaseUrl", baseUrl,
        "-AccessGateOnly",
        "-ExpectAccessGate"
      ]);
      const report = JSON.parse(negative.stdout);
      assert.equal(negative.status, 1, negative.stderr);
      assert.ok(report.checks.some((check) => check.name === "access gate" && check.status === "fail"));
    });

    await withServer((req, res) => {
      if (req.url === "/healthz") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
        return;
      }
      res.statusCode = 302;
      res.setHeader("location", "https://test.cloudflareaccess.com/cdn-cgi/access/login");
      res.end();
    }, async (baseUrl) => {
      const positive = await runPowerShell(remoteSmokeScript, [
        "-BaseUrl", baseUrl,
        "-AccessGateOnly",
        "-ExpectAccessGate"
      ]);
      const report = JSON.parse(positive.stdout);
      assert.equal(positive.status, 0, positive.stderr);
      assert.ok(report.checks.some((check) => check.name === "access gate" && check.status === "pass"));
    });
  });

  it("rejects an active executor state for a different target without starting another process", async (t) => {
    await mkdir(join(process.cwd(), "runtime", "tmp"), { recursive: true });
    try {
      await readFile(executorProcessStatePath, "utf8");
      t.skip("An executor is already active in this workspace; leave its state untouched.");
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await writeFile(executorProcessStatePath, JSON.stringify({
      pid: process.pid,
      baseUrl: "http://127.0.0.1:65531",
      executorId: "test-executor-a"
    }), "utf8");
    try {
      const sameTarget = await runPowerShell(executorStartScript, [
        "-BaseUrl", "http://127.0.0.1:65531",
        "-ExecutorId", "test-executor-a"
      ]);
      assert.equal(sameTarget.status, 0, sameTarget.stderr);

      const differentTarget = await runPowerShell(executorStartScript, [
        "-BaseUrl", "http://127.0.0.1:65532",
        "-ExecutorId", "test-executor-b"
      ]);
      assert.equal(differentTarget.status, 1);
      const compactError = `${differentTarget.stdout}\n${differentTarget.stderr}`.replace(/\s+/g, "");
      assert.match(compactError, /alreadyrunningforadifferenttarget/);
    } finally {
      await rm(executorProcessStatePath, { force: true });
    }
  });

  it("requires both browser and local-executor Access policies for smoke readiness", async () => {
    await withServer((req, res) => {
      if (req.url === "/healthz") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "ai-link-auth-hub" }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    }, async (baseUrl) => {
      const result = await runRemoteNext({
        baseUrl,
        env: {
          AI_LINK_BASE_URL: baseUrl,
          AI_LINK_ADMIN_TOKEN: "test-policy-admin-token",
          AI_LINK_EXECUTOR_TOKEN: "test-policy-executor-token",
          AI_LINK_EXECUTOR_ID: "local-executor",
          AI_LINK_CODEX_TOKEN: "test-policy-codex-token",
          AI_LINK_APP_PASSWORD: "test-policy-app-password",
          AI_LINK_SESSION_SECRET: "test-policy-session-secret",
          AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "true",
          AI_LINK_CLOUDFLARE_ACCESS_AUD: "test-policy-aud",
          AI_LINK_CLOUDFLARE_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
          AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com",
          AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN: "false",
          CF_ACCESS_CLIENT_ID: "test-policy-client-id",
          CF_ACCESS_CLIENT_SECRET: "test-policy-client-secret"
        }
      });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.remoteReady, true);
      assert.equal(report.summary.smokeReady, false);
      assert.ok(report.blockers.some((blocker) => blocker.includes("ALLOW_SERVICE_TOKEN=true")));
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
