#!/usr/bin/env node

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const strict = args.includes("--strict");
const baseUrl = trimSlash(valueAfter("--base-url") || process.env.AI_LINK_BASE_URL || "http://127.0.0.1:10000");
const token = valueAfter("--token") || process.env.AI_LINK_CODEX_TOKEN || process.env.AI_LINK_ADMIN_TOKEN || "";

const report = await buildReport({ baseUrl, token });

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (strict && !report.summary.ok) {
  process.exitCode = 1;
}

async function buildReport({ baseUrl: targetBaseUrl, token: bearerToken }) {
  const generatedAt = new Date().toISOString();
  const target = {
    baseUrl: targetBaseUrl,
    authStatusUrl: `${targetBaseUrl}/api/auth-status`
  };

  if (!bearerToken) {
    return {
      generatedAt,
      summary: {
        ok: false,
        reachable: false,
        nextActions: 0,
        blockingCount: 1,
        recommendedNext: "Set AI_LINK_CODEX_TOKEN or AI_LINK_ADMIN_TOKEN in the current process, then rerun this read-only check."
      },
      target,
      authStatus: null,
      nextActions: [],
      blockers: ["Missing read-only Auth Hub API token in the current process."],
      safety: safetyNotes()
    };
  }

  const response = await fetchAuthStatus({ target, bearerToken });
  if (!response.ok) {
    return {
      generatedAt,
      summary: {
        ok: false,
        reachable: response.reachable,
        nextActions: 0,
        blockingCount: 1,
        recommendedNext: response.reachable
          ? "Confirm the token has connectors:read scope and the Auth Hub URL is correct."
          : "Start Auth Hub locally or fix the remote Auth Hub URL / network path."
      },
      target,
      authStatus: null,
      nextActions: [],
      blockers: [response.detail],
      safety: safetyNotes()
    };
  }

  const authStatus = response.data?.authStatus || {};
  const nextActions = Array.isArray(authStatus.nextActions) ? authStatus.nextActions.map(publicAction) : [];
  const blockers = nextActions
    .filter((action) => action.severity === "blocked")
    .map((action) => `${action.platform}: ${action.reason}`);
  const unverified = (Array.isArray(authStatus.items) ? authStatus.items : [])
    .filter((item) => item.status === "unverified")
    .map((item) => `${item.platform}: ${item.reason || "unverified"}`);
  blockers.push(...unverified);
  const manualCount = nextActions.filter((action) => action.severity !== "blocked").length;
  return {
    generatedAt,
    summary: {
      ok: blockers.length === 0,
      reachable: true,
      nextActions: nextActions.length,
      blockingCount: blockers.length,
      manualCount,
      recommendedNext: recommendedNext({ nextActions, blockers })
    },
    target,
    authStatus: {
      summary: authStatus.summary || {},
      items: Array.isArray(authStatus.items) ? authStatus.items.map(publicItem) : []
    },
    nextActions,
    blockers,
    safety: safetyNotes()
  };
}

async function fetchAuthStatus({ target, bearerToken }) {
  try {
    const headers = {
      authorization: `Bearer ${bearerToken}`,
      accept: "application/json"
    };
    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
    }
    const response = await fetch(target.authStatusUrl, {
      headers,
      signal: AbortSignal.timeout(Number(process.env.AI_LINK_AUTH_STATUS_TIMEOUT_MS || 20000))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        reachable: true,
        detail: `Auth Hub /api/auth-status returned HTTP ${response.status}.`
      };
    }
    return { ok: true, reachable: true, data };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      detail: `Auth Hub /api/auth-status is not reachable: ${error.message}.`
    };
  }
}

function publicAction(action) {
  return {
    platform: stringValue(action.platform),
    status: stringValue(action.status),
    reason: stringValue(action.reason),
    title: stringValue(action.title),
    owner: stringValue(action.owner),
    severity: stringValue(action.severity),
    runbook: stringValue(action.runbook),
    relatedTaskIds: safeTaskIds(action.relatedTaskIds),
    retryAfterAction: action.retryAfterAction === true
  };
}

function publicItem(item) {
  return {
    platform: stringValue(item.platform),
    status: stringValue(item.status),
    connectorStatus: stringValue(item.connectorStatus),
    mode: stringValue(item.mode),
    source: stringValue(item.source),
    runtimeStatus: stringValue(item.runtimeStatus),
    operationalStatus: stringValue(item.operationalStatus),
    canRunReal: item.canRunReal === true,
    reason: stringValue(item.reason),
    action: stringValue(item.action),
    relatedTaskIds: safeTaskIds(item.relatedTaskIds)
  };
}

function safeTaskIds(values) {
  return Array.isArray(values)
    ? values.map((value) => stringValue(value)).filter(Boolean).slice(0, 5)
    : [];
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function recommendedNext({ nextActions, blockers }) {
  if (blockers.length > 0) {
    return "Resolve blocked actions or obtain fresh executor/probe evidence before dependent projects continue real-platform automation.";
  }
  if (nextActions.length > 0) {
    return "Complete the listed manual actions, then retry the related Auth Hub tasks if retryAfterAction is true.";
  }
  return "No platform authorization action is needed and the reported runtime evidence is sufficient for normal automation.";
}

function safetyNotes() {
  return [
    "This command only calls GET /api/auth-status and prints public-safe fields.",
    "It never prints API tokens, Cloudflare service tokens, Cookie, Profile, QR codes, screenshots, account details, raw platform responses, or runtime/private paths.",
    "Dependent projects should use this report as a pause/remind/retry signal, not as a source of login state."
  ];
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# AI Link Auth Status Next Actions");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for project handoff. It does not print token values or login state.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Auth Hub: ${report.target.baseUrl}`);
  lines.push(`- Reachable: ${report.summary.reachable ? "yes" : "no"}`);
  lines.push(`- Next actions: ${report.summary.nextActions}`);
  lines.push(`- Blocking count: ${report.summary.blockingCount}`);
  if (Number.isFinite(report.summary.manualCount)) {
    lines.push(`- Manual count: ${report.summary.manualCount}`);
  }
  lines.push(`- Recommended next: ${report.summary.recommendedNext}`);
  lines.push("");

  if (report.nextActions.length > 0) {
    lines.push("## Next Actions");
    lines.push("");
    lines.push("| Platform | Owner | Severity | Reason | Runbook | Related tasks |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const action of report.nextActions) {
      lines.push(`| ${cell(action.platform)} | ${cell(action.owner)} | ${cell(action.severity)} | ${cell(action.reason)} | ${cell(action.runbook)} | ${cell(action.relatedTaskIds.join(", ") || "-")} |`);
    }
    lines.push("");
  }

  if (report.authStatus?.items?.length > 0) {
    lines.push("## Platform Status");
    lines.push("");
    lines.push("| Platform | Status | Reason | Action | Related tasks |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const item of report.authStatus.items) {
      lines.push(`| ${cell(item.platform)} | ${cell(item.status)} | ${cell(item.reason)} | ${cell(item.action)} | ${cell(item.relatedTaskIds.join(", ") || "-")} |`);
    }
    lines.push("");
  }

  if (report.blockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  lines.push("## Safety");
  lines.push("");
  for (const item of report.safety) {
    lines.push(`- ${item}`);
  }
  return `${lines.join("\n")}\n`;
}

function valueAfter(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function cell(value) {
  return String(value || "-").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
