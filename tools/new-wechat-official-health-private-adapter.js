#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const force = args.includes("--force");
const print = args.includes("--print");
const outputPath = valueAfter("--output") || "runtime/private/wechat-official-health-adapter.mjs";
const resolvedOutput = path.resolve(process.cwd(), outputPath);
const privateRoot = path.resolve(process.cwd(), "runtime", "private");
const relativeOutput = path.relative(process.cwd(), resolvedOutput).replaceAll("\\", "/");
const mockWechatImport = moduleSpecifier(
  path.relative(path.dirname(resolvedOutput), path.resolve(process.cwd(), "src", "connectors", "mockWechat.js"))
);

const report = buildReport();

if (!print && report.summary.ok) {
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, adapterTemplate(), { encoding: "utf8", flag: force ? "w" : "wx" });
  report.summary.written = true;
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function buildReport() {
  const blockers = [];
  if (!isInside(privateRoot, resolvedOutput)) {
    blockers.push("Output path must stay under runtime/private.");
  }
  if (![".mjs", ".js"].includes(path.extname(resolvedOutput))) {
    blockers.push("Output file extension must be .mjs or .js.");
  }
  if (!force && existsSync(resolvedOutput) && !print) {
    blockers.push("Output file already exists. Rerun with --force only after reviewing the existing private file.");
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ok: blockers.length === 0,
      written: false,
      printOnly: print,
      output: relativeOutput,
      blockingCount: blockers.length,
      recommendedNext: blockers.length
        ? "Resolve the listed blockers, then rerun this generator."
        : "Set the WeChat Official Account AppID and AppSecret only in the current terminal, point AI_LINK_PRIVATE_CONNECTOR_MODULE to the generated file, then run a wechat_official/check_health task."
    },
    output: {
      path: relativeOutput,
      privateRoot: "runtime/private"
    },
    blockers,
    commands: [
      "$env:WECHAT_OFFICIAL_APP_ID=\"<official-account-app-id>\"",
      "$env:WECHAT_OFFICIAL_APP_SECRET=\"<official-account-app-secret>\"",
      `$env:AI_LINK_PRIVATE_CONNECTOR_MODULE=\"${relativeOutput}\"`,
      "npm run auth-hub:executor:start"
    ],
    safety: [
      "The generated file is written under runtime/private and must not be committed.",
      "The adapter reads WECHAT_OFFICIAL_APP_ID and WECHAT_OFFICIAL_APP_SECRET from the current process only; it never writes or prints their values.",
      "The adapter calls only the official stable access-token endpoint as a read-only health check and discards any access token immediately.",
      "Content reading, draft creation, publishing, and metrics remain on the existing mock connector paths."
    ]
  };
}

function adapterTemplate() {
  return `import { MockWechatConnector } from ${JSON.stringify(mockWechatImport)};

const WECHAT_STABLE_TOKEN_API = "https://api.weixin.qq.com/cgi-bin/stable_token";
const INVALID_CREDENTIAL_CODES = new Set([40013, 40125]);
const IP_ALLOWLIST_CODES = new Set([40164]);
const RATE_LIMIT_CODES = new Set([45009]);

export async function createPrivateConnectors() {
  return {
    wechat_official: new WechatOfficialHealthConnector()
  };
}

class WechatOfficialHealthConnector extends MockWechatConnector {
  constructor() {
    super();
    this.mode = "private";
    this.capabilityModes = Object.freeze({
      check_health: "private",
      read_content: "mock",
      create_draft: "mock",
      publish: "mock",
      metrics: "mock"
    });
  }

  async checkHealth() {
    return checkOfficialApiHealth();
  }
}

async function checkOfficialApiHealth() {
  const appId = process.env.WECHAT_OFFICIAL_APP_ID || "";
  const appSecret = process.env.WECHAT_OFFICIAL_APP_SECRET || "";
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  if (!appId || !appSecret) {
    return result({
      status: "needs_action",
      sessionState: "missing",
      checkedAt,
      startedAt,
      code: "credential_missing"
    });
  }

  let response;
  try {
    response = await fetch(WECHAT_STABLE_TOKEN_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "ai-link-auth-health"
      },
      body: JSON.stringify({
        grant_type: "client_credential",
        appid: appId,
        secret: appSecret,
        force_refresh: false
      }),
      signal: AbortSignal.timeout(timeoutMs())
    });
  } catch {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      startedAt,
      code: "official_api_unavailable"
    });
  }

  if (response.status === 429) {
    return result({
      status: "needs_action",
      sessionState: "not_required",
      checkedAt,
      startedAt,
      code: "official_api_rate_limited",
      retryAfterSeconds: retryAfterSeconds(response)
    });
  }
  if (response.status === 401 || response.status === 403) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      startedAt,
      code: "credential_invalid"
    });
  }
  if (!response.ok) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      startedAt,
      code: "official_api_unavailable"
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      startedAt,
      code: "official_api_unavailable"
    });
  }

  const errorCode = Number(payload?.errcode || 0);
  if (!errorCode && typeof payload?.access_token === "string" && payload.access_token) {
    return result({
      status: "ready",
      sessionState: "not_required",
      checkedAt,
      startedAt
    });
  }
  if (INVALID_CREDENTIAL_CODES.has(errorCode)) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      startedAt,
      code: "credential_invalid"
    });
  }
  if (IP_ALLOWLIST_CODES.has(errorCode)) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      startedAt,
      code: "official_api_ip_not_whitelisted"
    });
  }
  if (RATE_LIMIT_CODES.has(errorCode)) {
    return result({
      status: "needs_action",
      sessionState: "not_required",
      checkedAt,
      startedAt,
      code: "official_api_rate_limited",
      retryAfterSeconds: retryAfterSeconds(response)
    });
  }

  return result({
    status: "needs_action",
    sessionState: "blocked",
    checkedAt,
    startedAt,
    code: "official_api_unavailable"
  });
}

function result({
  status,
  sessionState,
  checkedAt,
  startedAt,
  code = "",
  retryAfterSeconds = 0
}) {
  return {
    schema_version: "1",
    platform: "wechat_official",
    operation: "check_health",
    status,
    session: {
      state: sessionState,
      checked_at: checkedAt
    },
    items: [],
    action_required: status === "ready" ? null : { code },
    diagnostics: {
      item_count: 0,
      duration_ms: Math.min(Math.max(Date.now() - startedAt, 0), 600000),
      ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {})
    }
  };
}

function timeoutMs() {
  const configured = Number(process.env.AI_LINK_WECHAT_AUTH_TIMEOUT_MS || 15000);
  if (!Number.isFinite(configured)) return 15000;
  return Math.min(Math.max(Math.floor(configured), 1000), 60000);
}

function retryAfterSeconds(response) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return 0;
  return Math.min(Math.floor(retryAfter), 86400);
}
`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# WeChat Official Health Adapter Scaffold");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`- Output: ${report.output.path}`);
  lines.push(`- Print only: ${report.summary.printOnly ? "yes" : "no"}`);
  lines.push(`- Written: ${report.summary.written ? "yes" : "no"}`);
  lines.push(`- Blocking count: ${report.summary.blockingCount}`);
  lines.push(`- Recommended next: ${report.summary.recommendedNext}`);
  lines.push("");
  if (report.blockers.length) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }
  lines.push("## Commands");
  lines.push("");
  lines.push("```powershell");
  lines.push(...report.commands);
  lines.push("```");
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  for (const item of report.safety) lines.push(`- ${item}`);
  return `${lines.join("\n")}\n`;
}

function valueAfter(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function moduleSpecifier(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}
