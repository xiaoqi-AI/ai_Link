#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { cloudflareServiceHeaders, validateAuthHubTarget } from "../src/security/authHubOutbound.js";

const args = process.argv.slice(2);
const maxStateBytes = 64 * 1024;
const outputJson = args.includes("--json");
const strict = args.includes("--strict");
const watch = args.includes("--watch");
const baseUrl = trimSlash(valueAfter("--base-url") || process.env.AI_LINK_BASE_URL || "http://127.0.0.1:10000");
const token = valueAfter("--token") || process.env.AI_LINK_CODEX_TOKEN || process.env.AI_LINK_ADMIN_TOKEN || "";
const rawRequestedPlatforms = valuesAfter("--platform");
const rawRequiredOperations = valuesAfter("--require-operation");
const requiredOperationInput = normalizeRequiredOperations(rawRequiredOperations);
const requestedPlatforms = normalizePlatforms([
  ...rawRequestedPlatforms,
  ...requiredOperationInput.values.map((item) => item.platform)
]);
const platformFilterApplied = rawRequestedPlatforms.length > 0 || rawRequiredOperations.length > 0;
const invalidPlatformFilter = rawRequestedPlatforms.some((value) => !/^[a-z0-9_]{1,80}$/.test(String(value || "").trim()));
const scopeFingerprint = buildScopeFingerprint({
  baseUrl,
  requestedPlatforms,
  platformFilterApplied,
  requiredOperations: requiredOperationInput.values
});
let stateFile = "";

if (watch) {
  try {
    stateFile = resolveStateFile(valueAfter("--state-file") || `runtime/private/auth-status-notifier/state-${scopeFingerprint.slice(0, 16)}.json`);
  } catch {
    console.error("auth-hub:status:watch: state file must stay under runtime/private or runtime/tmp.");
    process.exit(1);
  }
}

const report = {
  schemaVersion: "1",
  ...await buildReport({
    baseUrl,
    token,
    requestedPlatforms,
    platformFilterApplied,
    invalidPlatformFilter,
    requiredOperations: requiredOperationInput.values,
    invalidOperationRequirement: requiredOperationInput.invalid
  })
};

if (watch) {
  const watchReport = await buildWatchReport({ report, stateFile, scopeFingerprint });
  if (outputJson) {
    console.log(JSON.stringify(watchReport, null, 2));
  } else {
    console.log(renderWatchMarkdown(watchReport));
  }
  if (!watchReport.monitoringOk) {
    process.exitCode = 1;
  }
} else if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (strict && !report.summary.ok) {
  process.exitCode = 1;
}

async function buildReport({
  baseUrl: targetBaseUrl,
  token: bearerToken,
  requestedPlatforms: platformFilter,
  platformFilterApplied,
  invalidPlatformFilter,
  requiredOperations,
  invalidOperationRequirement
}) {
  const generatedAt = new Date().toISOString();
  const target = {
    baseUrl: targetBaseUrl,
    authStatusUrl: `${targetBaseUrl}/api/auth-status`,
    platforms: platformFilter,
    requiredOperations
  };

  if (!bearerToken) {
    return {
      generatedAt,
      summary: {
        ok: false,
        reachable: false,
        nextActions: 0,
        blockingCount: 1,
        monitoringIssue: "missing_read_token",
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
        monitoringIssue: response.issueCode,
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
  const actionCoverage = evaluateActionCoverage(authStatus);
  const actionCoverageIssue = actionCoverage.issue;
  const allItems = Array.isArray(authStatus.items) ? authStatus.items.map(publicItem) : [];
  const items = platformFilterApplied
    ? allItems.filter((item) => platformFilter.includes(item.platform))
    : allItems;
  const allActions = Array.isArray(authStatus.nextActions) ? authStatus.nextActions.map(publicAction) : [];
  const nextActions = platformFilterApplied
    ? allActions.filter((action) => platformFilter.includes(action.platform))
    : allActions;
  const missingPlatforms = platformFilter.filter((platform) => !allItems.some((item) => item.platform === platform));
  const operationRequirements = requiredOperations.map((requirement) => {
    const item = items.find((candidate) => candidate.platform === requirement.platform);
    if (!item) {
      return { ...requirement, status: "platform_missing", reason: "missing_from_auth_status" };
    }
    if (actionCoverageIssue) {
      return { ...requirement, status: "coverage_unverified", reason: actionCoverageIssue };
    }
    if (item.status !== "ready") {
      return { ...requirement, status: "platform_not_ready", reason: item.reason || item.status || "unverified" };
    }
    if (!item.verifiedOperations.includes(requirement.operation)) {
      return { ...requirement, status: "operation_unverified", reason: "required_operation_unverified" };
    }
    return { ...requirement, status: "verified", reason: "probe_verified" };
  });
  const failedOperationRequirements = operationRequirements.filter((item) => item.status !== "verified");
  const blockers = unique([
    ...items
      .filter((item) => item.status !== "ready")
      .map((item) => `${item.platform}: ${item.reason || item.status || "unverified"}`),
    ...missingPlatforms.map((platform) => `${platform}: missing_from_auth_status`),
    ...failedOperationRequirements
      .filter((item) => item.status === "operation_unverified")
      .map((item) => `${item.platform}: ${item.reason}:${item.operation}`),
    ...(actionCoverageIssue ? [`auth_hub: ${actionCoverageIssue}`] : []),
    ...(invalidPlatformFilter ? ["invalid_platform_filter"] : []),
    ...(invalidOperationRequirement ? ["invalid_operation_requirement"] : [])
  ]);
  const manualCount = nextActions.filter((action) => action.severity !== "blocked").length;
  const filteredSummary = summarizeItems(items, nextActions);
  return {
    generatedAt,
    summary: {
      ok: blockers.length === 0,
      reachable: true,
      nextActions: nextActions.length,
      blockingCount: blockers.length,
      manualCount,
      monitoringIssue: "",
      recommendedNext: recommendedNext({ nextActions, blockers, failedOperationRequirements })
    },
    target,
    authStatus: {
      schemaVersion: stringValue(authStatus.schemaVersion),
      summary: {
        ...filteredSummary,
        action_tasks_complete: actionCoverage.complete,
        action_tasks_truncated: actionCoverage.truncated
      },
      items
    },
    operationRequirements,
    nextActions,
    blockers,
    safety: safetyNotes()
  };
}

function summarizeItems(items, nextActions) {
  const count = (status) => items.filter((item) => item.status === status).length;
  return {
    total: items.length,
    ready: count("ready"),
    unverified: count("unverified"),
    needs_action: count("needs_action"),
    reserved: count("reserved"),
    blocked: count("blocked"),
    next_actions: nextActions.length
  };
}

async function fetchAuthStatus({ target, bearerToken }) {
  try {
    const outboundTarget = validateAuthHubTarget(target.authStatusUrl);
    if (!outboundTarget.ok) {
      return {
        ok: false,
        reachable: false,
        issueCode: "auth_hub_target_rejected",
        detail: outboundTarget.detail
      };
    }
    const headers = {
      authorization: `Bearer ${bearerToken}`,
      accept: "application/json",
      ...cloudflareServiceHeaders(outboundTarget)
    };
    const response = await fetch(target.authStatusUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(Number(process.env.AI_LINK_AUTH_STATUS_TIMEOUT_MS || 20000))
    });
    if (!response.ok) {
      return {
        ok: false,
        reachable: true,
        issueCode: "auth_status_http_error",
        detail: `Auth Hub /api/auth-status returned HTTP ${response.status}.`
      };
    }
    let data;
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        reachable: true,
        issueCode: "auth_status_invalid_response",
        detail: "Auth Hub /api/auth-status returned an invalid JSON response."
      };
    }
    if (!validAuthStatusEnvelope(data)) {
      return {
        ok: false,
        reachable: true,
        issueCode: "auth_status_invalid_response",
        detail: "Auth Hub /api/auth-status returned an invalid response schema."
      };
    }
    return { ok: true, reachable: true, data };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      issueCode: "auth_hub_unreachable",
      detail: `Auth Hub /api/auth-status is not reachable: ${error.message}.`
    };
  }
}

function validAuthStatusEnvelope(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const authStatus = data.authStatus;
  return Boolean(
    authStatus
    && typeof authStatus === "object"
    && !Array.isArray(authStatus)
    && authStatus.summary
    && typeof authStatus.summary === "object"
    && !Array.isArray(authStatus.summary)
    && Array.isArray(authStatus.items)
    && Array.isArray(authStatus.nextActions)
  );
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
    verifiedOperations: safeStrings(item.verifiedOperations, 10),
    probe: publicProbe(item.probe),
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

function safeStrings(values, limit) {
  return Array.isArray(values)
    ? values.map((value) => stringValue(value)).filter(Boolean).slice(0, limit)
    : [];
}

function publicProbe(probe) {
  if (!probe || typeof probe !== "object" || Array.isArray(probe)) return null;
  return {
    status: stringValue(probe.status),
    checkedAt: stringValue(probe.checkedAt),
    expiresAt: stringValue(probe.expiresAt),
    issueCode: stringValue(probe.issueCode)
  };
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function recommendedNext({ nextActions, blockers, failedOperationRequirements = [] }) {
  if (failedOperationRequirements.length > 0) {
    return "Obtain fresh evidence for every required operation before the dependent project continues real-platform automation.";
  }
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
  if (report.target.platforms.length > 0) {
    lines.push(`- Platform filter: ${report.target.platforms.join(", ")}`);
  }
  if (report.target.requiredOperations.length > 0) {
    lines.push(`- Required operations: ${report.target.requiredOperations.map((item) => `${item.platform}=${item.operation}`).join(", ")}`);
  }
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
    lines.push("| Platform | Status | Verified operations | Probe | Reason | Action | Related tasks |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const item of report.authStatus.items) {
      lines.push(`| ${cell(item.platform)} | ${cell(item.status)} | ${cell(item.verifiedOperations.join(", ") || "-")} | ${cell(item.probe?.status || "-")} | ${cell(item.reason)} | ${cell(item.action)} | ${cell(item.relatedTaskIds.join(", ") || "-")} |`);
    }
    lines.push("");
  }

  if (report.operationRequirements?.length > 0) {
    lines.push("## Operation Requirements");
    lines.push("");
    lines.push("| Platform | Required operation | Status | Reason |");
    lines.push("| --- | --- | --- | --- |");
    for (const requirement of report.operationRequirements) {
      lines.push(`| ${cell(requirement.platform)} | ${cell(requirement.operation)} | ${cell(requirement.status)} | ${cell(requirement.reason)} |`);
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

async function buildWatchReport({ report, stateFile: targetStateFile, scopeFingerprint: expectedScopeFingerprint }) {
  const monitoringFailure = monitoringFailureReason(report);
  if (monitoringFailure) {
    return monitoringFailureReport({ report, reason: monitoringFailure });
  }

  const snapshot = buildSnapshot(report, expectedScopeFingerprint);
  let previous = null;

  try {
    previous = await readSnapshot(targetStateFile, expectedScopeFingerprint);
  } catch (error) {
    return monitoringFailureReport({ report, reason: error?.code || "state_unreadable" });
  }

  const baseline = previous === null;
  const previousByIdentity = new Map((previous?.signals || []).map((signal) => [signalIdentity(signal), signal]));
  const currentByIdentity = new Map(snapshot.signals.map((signal) => [signalIdentity(signal), signal]));
  const newSignals = baseline
    ? []
    : snapshot.signals.filter((signal) => !previousByIdentity.has(signalIdentity(signal)));
  const worsenedSignals = baseline
    ? []
    : snapshot.signals.filter((signal) => {
      const oldSignal = previousByIdentity.get(signalIdentity(signal));
      return oldSignal && attentionRank(signal) > attentionRank(oldSignal);
    });
  const updatedSignals = baseline
    ? []
    : snapshot.signals.filter((signal) => {
      const oldSignal = previousByIdentity.get(signalIdentity(signal));
      return oldSignal
        && attentionRank(signal) <= attentionRank(oldSignal)
        && signalKey(signal) !== signalKey(oldSignal);
    });
  const resolvedSignals = baseline
    ? []
    : previous.signals.filter((signal) => !currentByIdentity.has(signalIdentity(signal)));
  const changed = !baseline && snapshot.fingerprint !== previous.fingerprint;
  const notify = changed && (newSignals.length > 0 || worsenedSignals.length > 0);
  const reason = baseline
    ? "baseline_created"
    : newSignals.length > 0 && worsenedSignals.length > 0
      ? "new_and_worsened_attention"
      : newSignals.length > 0
        ? "new_attention_required"
        : worsenedSignals.length > 0
          ? "worsened_attention_required"
          : resolvedSignals.length > 0 && updatedSignals.length === 0
            ? "resolved_without_alert"
            : changed
              ? "changed_without_alert"
              : "unchanged";

  try {
    await writeSnapshot(targetStateFile, snapshot);
  } catch {
    return monitoringFailureReport({ report, reason: "state_write_failed" });
  }

  return {
    schemaVersion: 2,
    checkedAt: report.generatedAt,
    monitoringOk: true,
    monitoringAlert: false,
    baseline,
    changed,
    notify,
    reason,
    summary: {
      reachable: report.summary.reachable,
      reportOk: report.summary.ok,
      activeSignals: snapshot.signals.length,
      newSignals: newSignals.length,
      worsenedSignals: worsenedSignals.length,
      updatedSignals: updatedSignals.length,
      resolvedSignals: resolvedSignals.length
    },
    newSignals,
    worsenedSignals,
    updatedSignals,
    resolvedSignals,
    safety: watchSafetyNotes()
  };
}

function monitoringFailureReport({ report, reason }) {
  return {
    schemaVersion: 2,
    checkedAt: report.generatedAt,
    monitoringOk: false,
    monitoringAlert: true,
    baseline: false,
    changed: false,
    notify: false,
    reason,
    summary: {
      reachable: report.summary.reachable,
      reportOk: report.summary.ok,
      activeSignals: 0,
      newSignals: 0,
      worsenedSignals: 0,
      updatedSignals: 0,
      resolvedSignals: 0
    },
    newSignals: [],
    worsenedSignals: [],
    updatedSignals: [],
    resolvedSignals: [],
    safety: watchSafetyNotes()
  };
}

function monitoringFailureReason(report) {
  if (!report.authStatus) {
    return report.summary.monitoringIssue
      || (report.summary.reachable ? "auth_status_access_failed" : "auth_hub_unreachable");
  }
  if ((report.blockers || []).includes("invalid_platform_filter")) return "invalid_platform_filter";
  if ((report.blockers || []).includes("invalid_operation_requirement")) return "invalid_operation_requirement";
  if ((report.blockers || []).includes("auth_hub: action_task_list_truncated")) return "action_task_list_truncated";
  if ((report.blockers || []).includes("auth_hub: action_task_coverage_unverified")) return "action_task_coverage_unverified";
  if ((report.blockers || []).some((blocker) => blocker.endsWith(": missing_from_auth_status"))) return "missing_platform";
  return "";
}

function buildSnapshot(report, expectedScopeFingerprint) {
  const signals = attentionSignals(report);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(signals))
    .digest("hex");
  return {
    schemaVersion: 3,
    scopeFingerprint: expectedScopeFingerprint,
    lastSuccessfulCheckAt: report.generatedAt,
    fingerprint,
    signals
  };
}

function attentionSignals(report) {
  const signals = new Map();
  const add = (signal) => {
    const normalized = normalizeSignal(signal);
    const identity = signalIdentity(normalized);
    const current = signals.get(identity);
    if (
      !current
      || attentionRank(normalized) > attentionRank(current)
      || (attentionRank(normalized) === attentionRank(current) && signalKey(normalized) < signalKey(current))
    ) {
      signals.set(identity, normalized);
    }
  };

  for (const action of report.nextActions || []) {
    add({
      kind: "action",
      operation: "",
      platform: action.platform || "auth_hub",
      status: action.status || "needs_action",
      severity: action.severity || "manual",
      reason: action.reason || "manual_action_required"
    });
  }

  for (const requirement of report.operationRequirements || []) {
    if (requirement.status === "verified") continue;
    add({
      kind: "operation",
      operation: requirement.operation || "",
      platform: requirement.platform || "auth_hub",
      status: "blocked",
      severity: "blocked",
      reason: requirement.reason || "required_operation_unverified"
    });
  }

  return [...signals.values()].sort((left, right) => signalIdentity(left).localeCompare(signalIdentity(right)));
}

function normalizeSignal(signal) {
  const platform = boundedCode(signal.platform, "auth_hub");
  const kind = signal.kind === "operation" ? "operation" : "action";
  const operation = kind === "operation" ? boundedOperation(signal.operation) : "";
  const status = boundedCode(signal.status, "unverified");
  const severity = boundedCode(signal.severity, severityForStatus(status));
  const reason = boundedCode(signal.reason, status);
  return { platform, kind, operation, status, severity, reason };
}

function boundedCode(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_.:-]{1,120}$/.test(normalized) ? normalized : fallback;
}

function boundedOperation(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_.:-]{1,160}$/.test(normalized) ? normalized : "unknown_operation";
}

function severityForStatus(status) {
  if (status === "needs_action") return "manual";
  if (status === "ready") return "info";
  return "blocked";
}

function attentionRank(signal) {
  const severity = { info: 0, manual: 20, approval: 30, warning: 30, blocked: 40 }[signal.severity] ?? 20;
  const status = { ready: 0, unverified: 10, needs_action: 20, reserved: 30, blocked: 40 }[signal.status] ?? 20;
  return severity + status;
}

function signalKey(signal) {
  return [signalIdentity(signal), signal.status, signal.severity, signal.reason].join("|");
}

function signalIdentity(signal) {
  return [signal.platform, signal.kind, signal.operation].join("|");
}

async function readSnapshot(targetStateFile, expectedScopeFingerprint) {
  let raw;
  try {
    const bytes = await readFile(targetStateFile);
    if (bytes.byteLength > maxStateBytes) throw snapshotError("state_unreadable");
    raw = bytes.toString("utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    throw snapshotError("state_unreadable");
  }
  const allowedSnapshotKeys = ["fingerprint", "lastSuccessfulCheckAt", "schemaVersion", "scopeFingerprint", "signals"];
  const allowedSignalKeys = ["kind", "operation", "platform", "reason", "severity", "status"];
  const sanitizedSignals = Array.isArray(snapshot?.signals)
    ? snapshot.signals.map((signal) => normalizeSignal(signal))
    : [];
  const signalsAreStrict = Array.isArray(snapshot?.signals) && snapshot.signals.every((signal, index) => {
    if (!signal || typeof signal !== "object" || Array.isArray(signal)) return false;
    const keys = Object.keys(signal).sort();
    return JSON.stringify(keys) === JSON.stringify(allowedSignalKeys)
      && signalKey(sanitizedSignals[index]) === signalKey(signal);
  });
  const expectedFingerprint = createHash("sha256")
    .update(JSON.stringify(sanitizedSignals))
    .digest("hex");
  if (
    snapshot?.schemaVersion !== 3
    || JSON.stringify(Object.keys(snapshot).sort()) !== JSON.stringify(allowedSnapshotKeys)
    || typeof snapshot.scopeFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(snapshot.scopeFingerprint)
    || typeof snapshot.lastSuccessfulCheckAt !== "string"
    || !Number.isFinite(Date.parse(snapshot.lastSuccessfulCheckAt))
    || typeof snapshot.fingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(snapshot.fingerprint)
    || !signalsAreStrict
    || snapshot.fingerprint !== expectedFingerprint
  ) {
    throw snapshotError("state_unreadable");
  }
  if (snapshot.scopeFingerprint !== expectedScopeFingerprint) throw snapshotError("state_scope_mismatch");
  return { ...snapshot, signals: sanitizedSignals };
}

function snapshotError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function writeSnapshot(targetStateFile, snapshot) {
  await mkdir(dirname(targetStateFile), { recursive: true });
  const temporary = `${targetStateFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (Buffer.byteLength(content, "utf8") > maxStateBytes) throw snapshotError("state_write_failed");
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, targetStateFile);
    await chmod(targetStateFile, 0o600).catch(() => {});
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function resolveStateFile(value) {
  const workspace = resolve(process.cwd());
  const candidate = resolve(workspace, value);
  const allowedRoots = [
    resolve(workspace, "runtime/private"),
    resolve(workspace, "runtime/tmp")
  ];
  const allowed = allowedRoots.some((root) => {
    const child = relative(root, candidate);
    return child.length > 0 && !child.startsWith("..") && !isAbsolute(child);
  });
  if (!allowed) throw new Error("state path outside private runtime");
  return candidate;
}

function watchSafetyNotes() {
  return [
    "The first successful run creates a baseline and does not notify.",
    "Business notify=true is derived only from new or worsened public-safe Auth Hub nextActions.",
    "Monitoring failures use monitoringAlert=true, exit non-zero, and never create or advance a baseline.",
    "Resolved, improved, or same-rank reason changes update the baseline without sending a business alert.",
    "The snapshot stores only a hashed scope, signal kind, platform, required-operation code, status, severity, reason, successful-check time, and fingerprints in the local private runtime.",
    "No token, Cookie, Profile, QR code, screenshot, account identifier, task identifier, raw response, target URL, title, or runbook is stored."
  ];
}

function renderWatchMarkdown(report) {
  const lines = [
    "# AI Link Auth Status Change",
    "",
    `- Monitoring: ${report.monitoringOk ? "ok" : "failed"}`,
    `- Monitoring alert: ${report.monitoringAlert ? "yes" : "no"}`,
    `- Baseline created: ${report.baseline ? "yes" : "no"}`,
    `- Changed: ${report.changed ? "yes" : "no"}`,
    `- Notify owner: ${report.notify ? "yes" : "no"}`,
    `- Reason: ${report.reason}`,
    `- Active attention signals: ${report.summary.activeSignals}`,
    `- New signals: ${report.summary.newSignals}`,
    `- Worsened signals: ${report.summary.worsenedSignals}`,
    `- Updated without alert: ${report.summary.updatedSignals}`,
    `- Resolved signals: ${report.summary.resolvedSignals}`,
    ""
  ];
  if (report.newSignals.length > 0) {
    lines.push("## New Attention Signals", "", "| Kind | Platform | Operation | Status | Severity | Reason |", "| --- | --- | --- | --- | --- | --- |");
    for (const signal of report.newSignals) {
      lines.push(`| ${cell(signal.kind)} | ${cell(signal.platform)} | ${cell(signal.operation)} | ${cell(signal.status)} | ${cell(signal.severity)} | ${cell(signal.reason)} |`);
    }
    lines.push("");
  }
  if (report.worsenedSignals.length > 0) {
    lines.push("## Worsened Attention Signals", "", "| Kind | Platform | Operation | Status | Severity | Reason |", "| --- | --- | --- | --- | --- | --- |");
    for (const signal of report.worsenedSignals) {
      lines.push(`| ${cell(signal.kind)} | ${cell(signal.platform)} | ${cell(signal.operation)} | ${cell(signal.status)} | ${cell(signal.severity)} | ${cell(signal.reason)} |`);
    }
    lines.push("");
  }
  lines.push("## Safety", "", ...report.safety.map((item) => `- ${item}`));
  return `${lines.join("\n")}\n`;
}

function buildScopeFingerprint({
  baseUrl: targetBaseUrl,
  requestedPlatforms: platforms,
  platformFilterApplied: filterApplied,
  requiredOperations
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      targetBaseUrl,
      platforms: filterApplied ? platforms : ["*"],
      requiredOperations
    }))
    .digest("hex");
}

function valueAfter(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function valuesAfter(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) values.push(args[index + 1] || "");
  }
  return values;
}

function normalizePlatforms(values) {
  return [...new Set(values
    .map((value) => String(value || "").trim())
    .filter((value) => /^[a-z0-9_]{1,80}$/.test(value)))]
    .sort();
}

function evaluateActionCoverage(authStatus) {
  const summary = authStatus?.summary;
  const truncated = summary?.action_tasks_truncated === true;
  const complete = authStatus?.schemaVersion === "2"
    && summary?.action_tasks_complete === true
    && summary?.action_tasks_truncated === false;
  return {
    complete,
    truncated,
    issue: truncated ? "action_task_list_truncated" : (complete ? "" : "action_task_coverage_unverified")
  };
}

function normalizeRequiredOperations(values) {
  let invalid = false;
  const normalized = [];
  const seen = new Set();
  for (const raw of values) {
    const value = String(raw || "").trim();
    const separator = value.indexOf("=");
    const platform = separator > 0 ? value.slice(0, separator) : "";
    const operation = separator > 0 ? value.slice(separator + 1) : "";
    if (!/^[a-z0-9_]{1,80}$/.test(platform) || !/^[a-z0-9_.:-]{1,160}$/.test(operation)) {
      invalid = true;
      continue;
    }
    const key = `${platform}=${operation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ platform, operation });
  }
  return {
    invalid,
    values: normalized.sort((left, right) => (
      left.platform.localeCompare(right.platform) || left.operation.localeCompare(right.operation)
    ))
  };
}

function unique(values) {
  return [...new Set(values)];
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function cell(value) {
  return String(value || "-").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
