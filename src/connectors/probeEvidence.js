import {
  getPlatformAuthOperation,
  normalizePlatformConnectorResult,
  publicIssueForCode
} from "./platformAuthContracts.js";

export const CONNECTOR_PROBE_SCHEMA_VERSION = "1";
export const CONNECTOR_PROBE_INTENT = "connector_probe";

const EXECUTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROBE_OUTCOMES = new Set(["verified", "action_required", "blocked", "unverified"]);
const INTERNAL_ISSUE_CODES = new Set(["probe_result_invalid", "probe_source_untrusted"]);
const PRIVATE_CAPABILITY_MODES = new Set([
  "private",
  "live-read-only",
  "private-read-only",
  "official-api-read-only"
]);
const PROBE_OPERATIONS = Object.freeze({
  xiaohongshu: Object.freeze({ check_session: "check_session" }),
  wechat_official: Object.freeze({ check_health: "check_health" }),
  github: Object.freeze({ check_auth: "check_auth" })
});

export function isConnectorProbeTask(task) {
  return task?.workflow === "platform_auth_collect"
    && task?.options?.evidenceIntent === CONNECTOR_PROBE_INTENT;
}

export function connectorProbeKey(platform, operation) {
  return PROBE_OPERATIONS[platform]?.[operation]
    ? `${platform}/${operation}`
    : "";
}

export function eligibleConnectorProbeKeys({ heartbeat, now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (
    !heartbeat?.trusted
    || !validExecutorId(heartbeat.executorId)
    || !OPAQUE_ID_PATTERN.test(heartbeat.executorSessionId || "")
    || !validIso(heartbeat.expiresAt)
    || new Date(heartbeat.expiresAt).getTime() <= nowMs
  ) {
    return [];
  }

  const keys = [];
  for (const [platform, operations] of Object.entries(PROBE_OPERATIONS)) {
    const connector = Array.isArray(heartbeat.connectors)
      ? heartbeat.connectors.find((item) => item?.platform === platform)
      : null;
    if (connector?.status !== "available" || connector?.mode !== "private") continue;
    for (const [operation, capability] of Object.entries(operations)) {
      const reported = Array.isArray(connector.capabilities)
        ? connector.capabilities.find((item) => item?.name === capability)
        : null;
      if (
        reported?.available === true
        && PRIVATE_CAPABILITY_MODES.has(String(reported.mode || ""))
      ) {
        keys.push(connectorProbeKey(platform, operation));
      }
    }
  }
  return keys.sort();
}

export function buildConnectorProbeSettlement({ task, envelope, producerExecutorId, ttlMs, now = Date.now() } = {}) {
  if (!isConnectorProbeTask(task)) return null;

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (
    !Number.isFinite(nowMs)
    || task.status !== "running"
    || !validExecutorId(producerExecutorId)
    || producerExecutorId !== task.leasedBy
    || envelope?.executorId !== producerExecutorId
    || envelope?.executorSessionId !== task.leaseExecutorSessionId
    || envelope?.leaseId !== task.leaseId
    || !OPAQUE_ID_PATTERN.test(task.leaseId || "")
    || !OPAQUE_ID_PATTERN.test(task.leaseHeartbeatRevision || "")
    || !OPAQUE_ID_PATTERN.test(task.leaseExecutorSessionId || "")
    || !validIso(task.leaseExpiresAt)
    || new Date(task.leaseExpiresAt).getTime() <= nowMs
  ) {
    return null;
  }

  const platform = String(task.input?.platform || "");
  const operation = String(task.input?.operation || "");
  const capability = PROBE_OPERATIONS[platform]?.[operation];
  const operationContract = getPlatformAuthOperation(platform, operation);
  if (!capability || operationContract?.mode !== "read_only") return null;

  let normalizedResult = null;
  try {
    normalizedResult = normalizePlatformConnectorResult(envelope?.result, { platform, operation });
    if (normalizedResult.items.length !== 0) normalizedResult = null;
  } catch {
    normalizedResult = null;
  }

  const mappedOutcome = normalizedResult
    ? outcomeForEnvelope(envelope?.status, normalizedResult.status)
    : "unverified";
  const outcome = mappedOutcome || "unverified";
  const issueCode = outcome === "verified"
    ? ""
    : outcome
      ? String(normalizedResult?.action_required?.code || "probe_result_invalid")
      : "probe_result_invalid";

  const evidence = normalizeConnectorProbeEvidence({
    schemaVersion: CONNECTOR_PROBE_SCHEMA_VERSION,
    executorId: producerExecutorId,
    executorSessionId: task.leaseExecutorSessionId,
    platform,
    operation,
    capability,
    outcome,
    issueCode,
    taskId: task.id,
    attemptId: task.leaseId,
    heartbeatRevision: task.leaseHeartbeatRevision,
    checkedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + boundedTtl(ttlMs)).toISOString()
  });
  if (!evidence) return null;

  const publicCode = outcome === "unverified"
    ? "connector_contract_failed"
    : String(normalizedResult?.action_required?.code || "");
  const issue = publicCode ? publicIssueForCode(publicCode) : null;
  const taskStatus = outcome === "verified"
    ? "completed"
    : outcome === "action_required"
      ? "action_required"
      : "failed";
  return {
    taskStatus,
    summary: probeSummary({ platform, operation, outcome, code: publicCode }),
    result: {
      schema_version: "1",
      platform,
      operation,
      status: outcome === "verified" ? "ready" : (outcome === "action_required" ? "needs_action" : "blocked"),
      ...(publicCode ? {
        action_required: {
          code: publicCode,
          action: issue?.action || "repair_private_connector_contract",
          retryable: issue?.retryable === true
        }
      } : {})
    },
    error: publicCode ? {
      code: publicCode,
      platform,
      action: issue?.action || "repair_private_connector_contract",
      retryable: issue?.retryable === true
    } : null,
    evidence
  };
}

export function buildConnectorProbeEvidence(options = {}) {
  return buildConnectorProbeSettlement(options)?.evidence || null;
}

export function normalizeConnectorProbeEvidence(value) {
  if (!plainObject(value) || !onlyKeys(value, [
    "schemaVersion",
    "executorId",
    "executorSessionId",
    "platform",
    "operation",
    "capability",
    "outcome",
    "issueCode",
    "taskId",
    "attemptId",
    "heartbeatRevision",
    "checkedAt",
    "expiresAt"
  ])) {
    return null;
  }
  if (
    value.schemaVersion !== CONNECTOR_PROBE_SCHEMA_VERSION
    || !validExecutorId(value.executorId)
    || !OPAQUE_ID_PATTERN.test(value.executorSessionId || "")
    || !OPAQUE_ID_PATTERN.test(value.taskId || "")
    || !OPAQUE_ID_PATTERN.test(value.attemptId || "")
    || !OPAQUE_ID_PATTERN.test(value.heartbeatRevision || "")
  ) {
    return null;
  }

  const capability = PROBE_OPERATIONS[value.platform]?.[value.operation];
  if (
    !capability
    || capability !== value.capability
    || getPlatformAuthOperation(value.platform, value.operation)?.mode !== "read_only"
    || !PROBE_OUTCOMES.has(value.outcome)
    || !validIso(value.checkedAt)
    || !validIso(value.expiresAt)
    || new Date(value.expiresAt).getTime() <= new Date(value.checkedAt).getTime()
  ) {
    return null;
  }

  const issueCode = String(value.issueCode || "");
  if (
    (value.outcome === "verified" && issueCode)
    || (value.outcome !== "verified" && !publicIssueForCode(issueCode) && !INTERNAL_ISSUE_CODES.has(issueCode))
  ) {
    return null;
  }

  return {
    schemaVersion: CONNECTOR_PROBE_SCHEMA_VERSION,
    executorId: value.executorId,
    executorSessionId: value.executorSessionId,
    platform: value.platform,
    operation: value.operation,
    capability,
    outcome: value.outcome,
    issueCode,
    taskId: value.taskId,
    attemptId: value.attemptId,
    heartbeatRevision: value.heartbeatRevision,
    checkedAt: value.checkedAt,
    expiresAt: value.expiresAt
  };
}

function outcomeForEnvelope(envelopeStatus, resultStatus) {
  if (envelopeStatus === "completed" && resultStatus === "ready") return "verified";
  if (envelopeStatus === "needs_action" && resultStatus === "needs_action") return "action_required";
  if (envelopeStatus === "failed" && resultStatus === "blocked") return "blocked";
  return "";
}

function probeSummary({ platform, operation, outcome, code }) {
  if (outcome === "verified") {
    return `${platform}/${operation} read-only probe verified.`;
  }
  return `${platform}/${operation} read-only probe did not verify (${code || "connector_contract_failed"}).`;
}

function boundedTtl(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 900000;
  return Math.min(86400000, Math.max(60000, Math.floor(parsed)));
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validExecutorId(value) {
  return typeof value === "string" && EXECUTOR_ID_PATTERN.test(value);
}

function validIso(value) {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));
}
