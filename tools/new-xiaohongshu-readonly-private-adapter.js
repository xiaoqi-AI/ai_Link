#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const force = args.includes("--force");
const print = args.includes("--print");
const outputPath = valueAfter("--output") || "runtime/private/xiaohongshu-readonly-adapter.mjs";
const resolvedOutput = path.resolve(process.cwd(), outputPath);
const privateRoot = path.resolve(process.cwd(), "runtime", "private");
const relativeOutput = path.relative(process.cwd(), resolvedOutput).replaceAll("\\", "/");
const privateRootSpecifier = directorySpecifier(path.relative(path.dirname(resolvedOutput), privateRoot));

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
  if (![".mjs", ".js"].includes(path.extname(resolvedOutput).toLowerCase())) {
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
        : "Install a reviewed read-only bridge under runtime/private, set AI_LINK_XHS_READONLY_BRIDGE, then run check_session before any approved begin_login task."
    },
    output: {
      path: relativeOutput,
      privateRoot: "runtime/private"
    },
    blockers,
    commands: [
      "$env:AI_LINK_XHS_READONLY_BRIDGE=\"runtime/private/xiaohongshu-readonly-bridge.mjs\"",
      `$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="${relativeOutput}"`,
      "npm run auth-hub:executor:start"
    ],
    bridgeContract: {
      transport: "node process with JSON stdin/stdout",
      operations: ["check_session", "begin_login", "search_content"],
      maximumItems: 4,
      allowedLocation: "runtime/private",
      shell: false
    },
    safety: [
      "The generated adapter and its bridge must stay under runtime/private and must not be committed.",
      "The adapter starts the bridge without a shell and sends only a bounded operation request as JSON.",
      "The bridge may open a visible browser only after Auth Hub approved begin_login; QR codes, captcha, Cookie, Profile, localStorage and account details remain private.",
      "Only 1-4 concrete Xiaohongshu note URLs, bounded text and stable public status codes may leave the adapter.",
      "Publishing, liking, commenting, following, messaging, captcha bypass and unattended login are outside this adapter."
    ]
  };
}

function adapterTemplate() {
  return `import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRIVATE_ROOT = fileURLToPath(new URL(${JSON.stringify(privateRootSpecifier)}, import.meta.url));
const BRIDGE_EXTENSIONS = new Set([".js", ".mjs"]);
const RESULT_STATUSES = new Set(["ready", "needs_action", "blocked"]);
const MAX_STDOUT_BYTES = 128 * 1024;
const MAX_QUERY_LENGTH = 120;
const DEFAULT_LIMIT = 4;
const ERROR_CODE_MAP = new Map([
  ["not_authenticated", "login_required"],
  ["login_required", "login_required"],
  ["session_expired", "login_expired"],
  ["login_expired", "login_expired"],
  ["captcha_required", "captcha_required"],
  ["verification_required", "verification_required"],
  ["rate_limited", "platform_rate_limited"],
  ["platform_rate_limited", "platform_rate_limited"],
  ["no_specific_notes", "specific_content_missing"],
  ["specific_content_missing", "specific_content_missing"]
]);

export async function createPrivateConnectors() {
  return {
    xiaohongshu: {
      mode: "private",
      capabilityModes: Object.freeze({
        check_session: "private",
        begin_login: "private",
        read_content: "private"
      }),
      checkSession: async () => invokeBridge("check_session", {}),
      beginLogin: async () => invokeBridge("begin_login", { interactive: true }),
      readContent: async ({ query = "AI", limit = DEFAULT_LIMIT } = {}) => invokeBridge("search_content", {
        query: boundedText(query, MAX_QUERY_LENGTH) || "AI",
        limit: boundedLimit(limit)
      })
    }
  };
}

async function invokeBridge(operation, input) {
  const startedAt = Date.now();
  const bridgePath = await resolveBridgePath();
  const request = {
    schema_version: "1",
    platform: "xiaohongshu",
    operation,
    input
  };
  const execution = await runBridge(bridgePath, operation, request);
  const payload = parseBridgeOutput(execution.stdout);
  return normalizeBridgePayload(payload, {
    operation,
    input,
    exitCode: execution.exitCode,
    startedAt
  });
}

async function resolveBridgePath() {
  const configured = process.env.AI_LINK_XHS_READONLY_BRIDGE
    || "runtime/private/xiaohongshu-readonly-bridge.mjs";
  let resolvedPrivateRoot;
  let resolvedBridge;
  try {
    [resolvedPrivateRoot, resolvedBridge] = await Promise.all([
      realpath(PRIVATE_ROOT),
      realpath(path.resolve(process.cwd(), configured))
    ]);
  } catch {
    throw publicError("connector_missing");
  }

  if (!isInside(resolvedPrivateRoot, resolvedBridge)
    || !BRIDGE_EXTENSIONS.has(path.extname(resolvedBridge).toLowerCase())) {
    throw publicError("connector_contract_failed");
  }
  try {
    const metadata = await stat(resolvedBridge);
    if (!metadata.isFile()) throw new Error("not a file");
  } catch {
    throw publicError("connector_contract_failed");
  }
  return resolvedBridge;
}

function runBridge(bridgePath, operation, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridgePath, "--operation", operation], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"]
    });
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // The process may already be closing; the public result stays the same.
      }
      finish(() => reject(publicError("platform_unavailable")));
    }, timeoutMs());

    child.on("error", () => finish(() => reject(publicError("connector_contract_failed"))));
    child.stdout.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_STDOUT_BYTES) {
        try {
          child.kill();
        } catch {
          // The process may already be closing; the public result stays the same.
        }
        finish(() => reject(publicError("connector_contract_failed")));
        return;
      }
      chunks.push(chunk);
    });
    child.on("close", (exitCode) => finish(() => resolve({
      exitCode: Number.isInteger(exitCode) ? exitCode : 1,
      stdout: Buffer.concat(chunks).toString("utf8")
    })));
    child.stdin.on("error", () => {});
    child.stdin.end(\`\${JSON.stringify(request)}\\n\`);
  });
}

function parseBridgeOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) throw publicError("connector_contract_failed");
  try {
    const payload = JSON.parse(text);
    if (!isPlainObject(payload)) throw new Error("invalid payload");
    return payload;
  } catch {
    throw publicError("connector_contract_failed");
  }
}

function normalizeBridgePayload(payload, { operation, input, exitCode, startedAt }) {
  if (exitCode !== 0 || payload.ok !== true) {
    const rawCode = isPlainObject(payload.error) ? String(payload.error.code || "") : "";
    const code = ERROR_CODE_MAP.get(rawCode);
    if (!code) throw publicError("connector_contract_failed");
    return result({
      operation,
      status: "needs_action",
      sessionState: sessionStateForCode(code),
      code,
      startedAt
    });
  }

  if (isPublicResult(payload)) return payload;

  const data = isPlainObject(payload.data) ? payload.data : {};
  if (operation === "search_content") {
    const items = normalizeItems(data, boundedLimit(input.limit));
    if (!items.length) {
      return result({
        operation,
        status: "needs_action",
        sessionState: "valid",
        code: "specific_content_missing",
        items,
        startedAt
      });
    }
    return result({
      operation,
      status: "ready",
      sessionState: "valid",
      items,
      startedAt
    });
  }

  const authenticated = data.authenticated === true || data.session_state === "valid";
  if (authenticated) {
    return result({
      operation,
      status: "ready",
      sessionState: "valid",
      startedAt
    });
  }
  return result({
    operation,
    status: "needs_action",
    sessionState: "missing",
    code: "login_required",
    startedAt
  });
}

function isPublicResult(value) {
  return isPlainObject(value)
    && RESULT_STATUSES.has(String(value.status || ""))
    && isPlainObject(value.session);
}

function normalizeItems(data, limit) {
  const rawItems = Array.isArray(data.items)
    ? data.items
    : (Array.isArray(data.notes) ? data.notes : []);
  const items = [];
  const seen = new Set();

  for (const raw of rawItems) {
    if (!isPlainObject(raw)) continue;
    const card = isPlainObject(raw.note_card) ? raw.note_card : raw;
    const noteId = noteIdFor(raw, card);
    const title = boundedText(card.display_title || card.title || raw.title, 200);
    if (!noteId || !title) continue;
    const sourceUrl = \`https://www.xiaohongshu.com/explore/\${encodeURIComponent(noteId)}\`;
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);

    const item = {
      source_platform: "xiaohongshu",
      source_url: sourceUrl,
      title,
      summary: boundedText(card.desc || raw.summary, 500),
      acquisition_provider: "ai_link_xhs_readonly",
      source_reachability: {
        status: "verified",
        method: "authenticated_xhs_search"
      }
    };
    const publishedAt = timestampOrEmpty(raw.published_at || card.published_at);
    if (publishedAt) item.published_at = publishedAt;
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

function noteIdFor(raw, card) {
  const direct = String(raw.id || raw.note_id || card.id || card.note_id || "");
  if (/^[A-Za-z0-9_-]{8,80}$/.test(direct)) return direct;

  const candidate = String(raw.source_url || raw.url || card.source_url || card.url || "");
  try {
    const url = new URL(candidate);
    if (!["xiaohongshu.com", "www.xiaohongshu.com"].includes(url.hostname.toLowerCase())) return "";
    const match = url.pathname.match(/^\\/(?:explore|discovery\\/item)\\/([A-Za-z0-9_-]{8,80})\\/?$/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function result({ operation, status, sessionState, code = "", items = [], startedAt }) {
  return {
    schema_version: "1",
    platform: "xiaohongshu",
    operation,
    status,
    session: {
      state: sessionState,
      checked_at: new Date().toISOString()
    },
    items,
    action_required: status === "ready" ? null : { code },
    diagnostics: {
      item_count: items.length,
      duration_ms: Math.min(Math.max(Date.now() - startedAt, 0), 600000)
    }
  };
}

function sessionStateForCode(code) {
  if (code === "login_required") return "missing";
  if (code === "login_expired") return "expired";
  if (["captcha_required", "verification_required"].includes(code)) return "verification_required";
  return "valid";
}

function timeoutMs() {
  const configured = Number(process.env.AI_LINK_XHS_READONLY_TIMEOUT_MS || 120000);
  if (!Number.isFinite(configured)) return 120000;
  return Math.min(Math.max(Math.floor(configured), 1000), 300000);
}

function boundedLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return DEFAULT_LIMIT;
  return Math.min(Math.max(number, 1), 4);
}

function boundedText(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function timestampOrEmpty(value) {
  const text = String(value || "");
  return text && text.length <= 64 && !Number.isNaN(Date.parse(text)) ? text : "";
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(\`..\${path.sep}\`)
    && !path.isAbsolute(relative);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function publicError(code) {
  const error = new Error("Xiaohongshu read-only bridge failed safely.");
  error.code = code;
  error.platform = "xiaohongshu";
  return error;
}
`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Xiaohongshu Read-only Private Adapter Scaffold");
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
  lines.push("## Bridge Contract");
  lines.push("");
  lines.push(`- Transport: ${report.bridgeContract.transport}`);
  lines.push(`- Operations: ${report.bridgeContract.operations.join(", ")}`);
  lines.push(`- Maximum items: ${report.bridgeContract.maximumItems}`);
  lines.push(`- Allowed location: ${report.bridgeContract.allowedLocation}`);
  lines.push(`- Shell execution: ${report.bridgeContract.shell ? "yes" : "no"}`);
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

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function directorySpecifier(value) {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized === ".") return "./";
  const relative = normalized.startsWith(".") ? normalized : `./${normalized}`;
  return relative.endsWith("/") ? relative : `${relative}/`;
}
