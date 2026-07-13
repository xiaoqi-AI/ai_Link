#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { cloudflareServiceHeaders, validateServiceAuthTarget } from "./auth-hub-remote-safety.js";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const baseUrlArg = valueAfter("--base-url");
const baseUrl = trimSlash(baseUrlArg || process.env.AI_LINK_BASE_URL || "https://auth.xiao-qi-ai.com");
const renderYamlPath = valueAfter("--render-yaml") || "render.yaml";

const requiredRenderRefs = [
  "AI_LINK_BASE_URL",
  "DATABASE_URL",
  "AI_LINK_APP_PASSWORD",
  "AI_LINK_SESSION_SECRET",
  "AI_LINK_SESSION_MAX_AGE_SECONDS",
  "AI_LINK_ADMIN_TOKEN",
  "AI_LINK_EXECUTOR_TOKEN",
  "AI_LINK_EXECUTOR_ID",
  "AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS",
  "AI_LINK_CONNECTOR_PROBE_TTL_MS",
  "AI_LINK_ARTIFACT_RETENTION_DAYS",
  "AI_LINK_APPROVAL_RETENTION_DAYS",
  "AI_LINK_AUDIT_RETENTION_DAYS",
  "AI_LINK_MAINTENANCE_AUDIT_RETENTION_DAYS",
  "AI_LINK_HEARTBEAT_RETENTION_GRACE_HOURS",
  "AI_LINK_PROBE_RETENTION_GRACE_DAYS",
  "AI_LINK_RETENTION_MAX_ROWS_PER_TABLE",
  "AI_LINK_CODEX_TOKEN",
  "AI_LINK_CODEX_SCOPES",
  "AI_LINK_REQUIRE_CLOUDFLARE_ACCESS",
  "AI_LINK_ALLOWED_ACCESS_EMAILS",
  "AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN",
  "AI_LINK_CLOUDFLARE_ACCESS_AUD",
  "AI_LINK_CLOUDFLARE_TEAM_DOMAIN"
];

const requiredSmokeEnv = [
  "AI_LINK_BASE_URL",
  "AI_LINK_ADMIN_TOKEN",
  "AI_LINK_EXECUTOR_TOKEN",
  "AI_LINK_EXECUTOR_ID",
  "AI_LINK_CODEX_TOKEN",
  "AI_LINK_APP_PASSWORD"
];

const requiredProductionEnv = [
  ...requiredSmokeEnv,
  "AI_LINK_SESSION_SECRET",
  "AI_LINK_REQUIRE_CLOUDFLARE_ACCESS",
  "AI_LINK_CLOUDFLARE_ACCESS_AUD"
];

const optionalAccessEnv = [
  "AI_LINK_ALLOWED_ACCESS_EMAILS",
  "AI_LINK_CLOUDFLARE_TEAM_DOMAIN",
  "AI_LINK_CLOUDFLARE_ACCESS_ISSUER",
  "AI_LINK_AUTH_HUB_ALLOWED_HOSTS",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET"
];

const serviceAuthTarget = validateServiceAuthTarget(baseUrl);
const remoteHealth = await checkHealthz(baseUrl, cloudflareServiceHeaders(serviceAuthTarget));
const envChecks = envPresence([...requiredProductionEnv, ...optionalAccessEnv]);
const renderCheck = checkRenderYaml(renderYamlPath);
const repository = gitState();
const missingRequiredEnv = envChecks.filter((item) => item.required && !item.set).map((item) => item.name);
const missingSmokeEnv = requiredSmokeEnv.filter((name) => !process.env[name]);
const missingAccessOperatorEnv = ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"].filter((name) => !process.env[name]);
const accessGuardEnabled = enabled(process.env.AI_LINK_REQUIRE_CLOUDFLARE_ACCESS);
const accessIssuerReady = Boolean(
  process.env.AI_LINK_CLOUDFLARE_TEAM_DOMAIN
  || process.env.AI_LINK_CLOUDFLARE_ACCESS_ISSUER
);
const browserAccessPolicyReady = Boolean(process.env.AI_LINK_ALLOWED_ACCESS_EMAILS);
const serviceTokenPolicyReady = enabled(process.env.AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN);
const accessVerificationReady = accessGuardEnabled
  && Boolean(process.env.AI_LINK_CLOUDFLARE_ACCESS_AUD)
  && accessIssuerReady
  && browserAccessPolicyReady
  && serviceTokenPolicyReady;
const remoteReady = remoteHealth.status === "pass";
const smokeReady = remoteReady
  && serviceAuthTarget.ok
  && missingSmokeEnv.length === 0
  && missingAccessOperatorEnv.length === 0
  && accessVerificationReady;

const blockers = [];
if (!remoteReady) {
  blockers.push(remoteHealth.detail);
}
if (!serviceAuthTarget.ok) {
  blockers.push(serviceAuthTarget.detail);
}
if (missingRequiredEnv.length > 0) {
  blockers.push(`Missing production/smoke environment markers in current process: ${missingRequiredEnv.join(", ")}.`);
}
if (missingAccessOperatorEnv.length > 0) {
  blockers.push("Cloudflare Access Service Auth client id/secret are not present in the current process.");
}
if (!accessGuardEnabled) {
  blockers.push("AI_LINK_REQUIRE_CLOUDFLARE_ACCESS must be true for remote smoke readiness.");
}
if (!accessIssuerReady) {
  blockers.push("Set AI_LINK_CLOUDFLARE_TEAM_DOMAIN or AI_LINK_CLOUDFLARE_ACCESS_ISSUER for signed JWT verification.");
}
if (!browserAccessPolicyReady) {
  blockers.push("Set AI_LINK_ALLOWED_ACCESS_EMAILS for the approved browser operator.");
}
if (!serviceTokenPolicyReady) {
  blockers.push("Explicitly set AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN=true after approving the local executor Service Auth path.");
}
if (!renderCheck.ok) {
  blockers.push("render.yaml is missing required Auth Hub deployment references.");
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: smokeReady,
    remoteReady,
    smokeReady,
    blockingCount: blockers.length,
    recommendedNext: recommendedNext({ remoteHealth, missingSmokeEnv, missingAccessOperatorEnv, renderOk: renderCheck.ok })
  },
  target: {
    baseUrl,
    healthzUrl: `${baseUrl}/healthz`
  },
  repository,
  checks: [
    {
      name: "remote healthz",
      status: remoteHealth.status,
      detail: remoteHealth.detail
    },
    {
      name: "Service Auth target",
      status: serviceAuthTarget.ok ? "pass" : "fail",
      detail: serviceAuthTarget.detail
    },
    {
      name: "render blueprint",
      status: renderCheck.ok ? "pass" : "fail",
      detail: renderCheck.ok
        ? "render.yaml references the expected Auth Hub service, Postgres, env vars, and /healthz check."
        : `Missing render.yaml references: ${renderCheck.missing.join(", ")}.`
    },
    {
      name: "Cloudflare Access verification",
      status: accessVerificationReady ? "pass" : "fail",
      detail: accessVerificationReady
        ? "Origin guard, audience, issuer/team domain, an approved browser policy, and the local-executor Service Auth policy are configured."
        : "Remote smoke requires the origin guard, audience, issuer/team domain, an approved browser email, and an explicitly enabled Service Auth policy."
    },
    ...envChecks.map((item) => ({
      name: `env ${item.name}`,
      status: item.set ? "pass" : item.required ? "fail" : "info",
      detail: item.set ? "Set in current process without exposing value." : "Not set in current process."
    }))
  ],
  blockers,
  manualActions: [
    {
      owner: "Infrastructure maintainer",
      action: "Confirm a dedicated Auth Hub hostname (recommended: auth.xiao-qi-ai.com), point it to the Render Web Service, then confirm /healthz returns the AI Link Auth Hub payload."
    },
    {
      owner: "Secret owner",
      action: "Set production AI_LINK_* values, DATABASE_URL, and Cloudflare Access values in Render or a secret manager; only inject temporary smoke values into the current terminal."
    },
    {
      owner: "Cloudflare Access owner",
      action: "Require allowed browser users and create Service Auth credentials for the local executor smoke test."
    },
    {
      owner: "Maintainer",
      action: "Run the Service Auth API/executor smoke, verify the unauthenticated edge gate, then complete approved-email browser login as a separate manual check."
    }
  ],
  commands: {
    inspect: [
      "npm run auth-hub:remote:next",
      "npm run auth-hub:remote:next:json",
      "npm run auth-hub:deploy:check"
    ],
    productionPreflight: [
      "powershell -ExecutionPolicy Bypass -File tools/check-auth-hub-deployment.ps1 -Production -BaseUrl \"https://auth.xiao-qi-ai.com\""
    ],
    remoteSmoke: [
      "$env:AI_LINK_BASE_URL=\"https://auth.xiao-qi-ai.com\"",
      "$env:AI_LINK_ADMIN_TOKEN=\"<admin-token-from-secret-store>\"",
      "$env:AI_LINK_EXECUTOR_TOKEN=\"<executor-token-from-secret-store>\"",
      "$env:AI_LINK_EXECUTOR_ID=\"local-executor\"",
      "$env:AI_LINK_CODEX_TOKEN=\"<codex-token-from-secret-store>\"",
      "$env:AI_LINK_APP_PASSWORD=\"<app-password-from-secret-store>\"",
      "$env:CF_ACCESS_CLIENT_ID=\"<cloudflare-service-auth-client-id>\"",
      "$env:CF_ACCESS_CLIENT_SECRET=\"<cloudflare-service-auth-client-secret>\"",
      "npm run auth-hub:remote:smoke",
      "Open https://auth.xiao-qi-ai.com/login in a browser and complete the approved-email plus application-password check."
    ],
    localFallback: [
      "npm run auth-hub:local:start",
      "powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -BaseUrl \"http://127.0.0.1:10001\" -AdminToken \"dev-admin-token\" -ExecutorToken \"dev-executor-token\" -CodexToken \"dev-codex-token\" -AppPassword \"dev-password\"",
      "npm run auth-hub:local:stop"
    ]
  },
  safety: [
    "This report only records whether environment variables are present, never their values.",
    "Do not put .env, tokens, DATABASE_URL, Cloudflare credentials, cookies, browser Profile, QR codes, screenshots, raw platform content, or runtime/private files in Git, docs, the knowledge mirror, issue/PR text, or chat.",
    "A local fallback smoke is useful evidence for code health, but it does not prove the dedicated remote Auth Hub hostname is deployed."
  ]
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function valueAfter(name) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return argv[index + 1] || "";
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function enabled(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

async function checkHealthz(targetBaseUrl, headers = {}) {
  const url = `${targetBaseUrl}/healthz`;
  try {
    const response = await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
    if (response.ok && data.ok === true && data.service === "ai-link-auth-hub") {
      return {
        status: "pass",
        httpStatus: response.status,
        detail: "Remote /healthz returned the AI Link Auth Hub payload."
      };
    }
    return {
      status: "fail",
      httpStatus: response.status,
      detail: `Remote /healthz returned HTTP ${response.status}, not the AI Link Auth Hub health payload.`
    };
  } catch (error) {
    return {
      status: "fail",
      httpStatus: 0,
      detail: `Remote /healthz is not reachable: ${error.message}.`
    };
  }
}

function envPresence(names) {
  const uniqueNames = [...new Set(names)];
  return uniqueNames.map((name) => ({
    name,
    required: requiredProductionEnv.includes(name),
    set: Boolean(process.env[name])
  }));
}

function checkRenderYaml(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {
      ok: false,
      missing: ["render.yaml"]
    };
  }
  const missing = [];
  for (const value of requiredRenderRefs) {
    if (!text.includes(value)) {
      missing.push(value);
    }
  }
  if (!/healthCheckPath:\s*\/healthz/.test(text)) {
    missing.push("healthCheckPath:/healthz");
  }
  if (!/type:\s*web/.test(text)) {
    missing.push("web service");
  }
  if (!/databases:/.test(text)) {
    missing.push("Postgres database");
  }
  if (!/autoDeployTrigger:\s*checksPass/.test(text)) {
    missing.push("autoDeployTrigger:checksPass");
  }
  if (!/databases:\s+[\s\S]*?plan:\s*basic-256mb/.test(text)) {
    missing.push("Postgres plan:basic-256mb");
  }
  if (!/databases:\s+[\s\S]*?ipAllowList:\s*\[\]/.test(text)) {
    missing.push("Postgres ipAllowList:[]");
  }
  if (!/key:\s*AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN\s+sync:\s*false/.test(text)) {
    missing.push("explicit Cloudflare service-token decision");
  }
  const webRegion = text.match(/services:[\s\S]*?-\s*type:\s*web[\s\S]*?region:\s*([a-z0-9-]+)[\s\S]*?(?=databases:)/)?.[1] || "";
  const databaseRegion = text.match(/databases:[\s\S]*?-\s*name:\s*ai-link-postgres[\s\S]*?region:\s*([a-z0-9-]+)/)?.[1] || "";
  if (!webRegion || !databaseRegion || webRegion !== databaseRegion) {
    missing.push("matching explicit Web/Postgres region decision");
  }
  if (!/renderSubdomainPolicy:\s*disabled/.test(text)) {
    missing.push("renderSubdomainPolicy:disabled");
  }
  if (!/domains:\s*(?:\[\s*auth\.xiao-qi-ai\.com\s*\]|\r?\n\s*-\s*auth\.xiao-qi-ai\.com(?:\s|$))/.test(text)) {
    missing.push("domains:auth.xiao-qi-ai.com");
  }
  return {
    ok: missing.length === 0,
    missing
  };
}

function gitState() {
  const branch = gitOutput(["branch", "--show-current"]);
  const head = gitOutput(["rev-parse", "--short", "HEAD"]);
  const upstream = gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const status = gitOutput(["status", "--porcelain"]);
  return {
    branch,
    head,
    upstream,
    clean: status.length === 0
  };
}

function gitOutput(commandArgs) {
  const result = spawnSync("git", commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function recommendedNext({ remoteHealth, missingSmokeEnv: missingEnv, missingAccessOperatorEnv: missingAccess, renderOk }) {
  if (!renderOk) {
    return "Fix render.yaml deployment references before external setup.";
  }
  if (remoteHealth.status !== "pass") {
    return "Configure Render custom domain / Cloudflare DNS until /healthz returns the AI Link Auth Hub payload.";
  }
  if (missingEnv.length > 0 || missingAccess.length > 0) {
    return "Inject temporary smoke credentials in the current terminal from the secret store, then rerun this check.";
  }
  return "Run the Service Auth API/executor smoke, then complete approved-email browser login as a separate manual acceptance.";
}

function renderMarkdown(remoteReport) {
  const lines = [];
  lines.push("# AI Link Auth Hub Remote Next");
  lines.push("");
  lines.push(`Generated: ${remoteReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It never prints secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Target: ${remoteReport.target.baseUrl}`);
  lines.push(`- Remote ready: ${remoteReport.summary.remoteReady ? "yes" : "no"}`);
  lines.push(`- Smoke ready: ${remoteReport.summary.smokeReady ? "yes" : "no"}`);
  lines.push(`- Blocking count: ${remoteReport.summary.blockingCount}`);
  lines.push(`- Recommended next: ${remoteReport.summary.recommendedNext}`);
  lines.push(`- Repository: ${remoteReport.repository.branch || "unknown"} @ ${remoteReport.repository.head || "unknown"}`);
  lines.push(`- Working tree clean: ${remoteReport.repository.clean ? "yes" : "no"}`);
  lines.push("");

  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const check of remoteReport.checks) {
    lines.push(`| ${escapeCell(check.name)} | ${escapeCell(check.status)} | ${escapeCell(check.detail)} |`);
  }
  lines.push("");

  if (remoteReport.blockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of remoteReport.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  lines.push("## Manual Actions");
  lines.push("");
  for (const action of remoteReport.manualActions) {
    lines.push(`- ${action.owner}: ${action.action}`);
  }
  lines.push("");

  lines.push("## Commands");
  lines.push("");
  for (const [name, commands] of Object.entries(remoteReport.commands)) {
    lines.push(`### ${name}`);
    lines.push("");
    lines.push("```powershell");
    lines.push(...commands);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Safety");
  lines.push("");
  for (const item of remoteReport.safety) {
    lines.push(`- ${item}`);
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
