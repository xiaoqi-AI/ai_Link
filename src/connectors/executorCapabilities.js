import {
  CONNECTOR_METHODS,
  PLATFORM_CONTRACTS,
  PLATFORM_REQUIRED_CAPABILITIES,
  describeConnectorRegistry
} from "./contracts.js";
import {
  buildConnectorProbeBinding,
  connectorProbeSubjectMatches,
  normalizeGitHubProbeTarget,
  normalizeConnectorProbeEvidence
} from "./probeEvidence.js";

export const EXECUTOR_CAPABILITY_SCHEMA_VERSION = "1";
export const TARGET_VERIFICATION_SCHEMA_VERSION = "1";

const EXECUTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const EXECUTOR_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CAPABILITY_MODE_PATTERN = /^[a-z0-9][a-z0-9+._-]{0,63}$/;
const CONNECTOR_STATUSES = new Set(["available", "misconfigured", "reserved"]);
const CONNECTOR_MODES = new Set([
  "mock",
  "private",
  "reserved",
  "public-check+mock-google-api",
  "private-api-client+public-check"
]);
const ISSUE_SEVERITIES = new Set(["error", "warning"]);
const ISSUE_CODES = new Set(["connector_missing", "connector_contract_failed"]);
const ISSUE_REASONS = new Set(["capability_missing"]);
const TARGET_VERIFICATION_LIMIT = 10;

export function buildExecutorCapabilityHeartbeat({ executorId, executorSessionId = "", registry }) {
  if (!validExecutorId(executorId)) {
    const error = new Error("Executor id is invalid.");
    error.code = "invalid_executor_id";
    throw error;
  }

  const description = describeConnectorRegistry(registry);
  return {
    schemaVersion: EXECUTOR_CAPABILITY_SCHEMA_VERSION,
    executorId,
    ...(validExecutorSessionId(executorSessionId) ? { executorSessionId } : {}),
    connectors: description.connectors.map(publicConnectorDescriptor)
  };
}

export function normalizeExecutorCapabilityHeartbeat(input) {
  if (!plainObject(input) || !onlyKeys(input, ["schemaVersion", "executorId", "executorSessionId", "connectors"])) {
    return invalidHeartbeat("invalid_envelope");
  }
  if (input.schemaVersion !== EXECUTOR_CAPABILITY_SCHEMA_VERSION) {
    return invalidHeartbeat("unsupported_schema_version");
  }
  if (!validExecutorId(input.executorId)) {
    return invalidHeartbeat("invalid_executor_id");
  }
  if (input.executorSessionId !== undefined && !validExecutorSessionId(input.executorSessionId)) {
    return invalidHeartbeat("invalid_executor_session_id");
  }

  const connectors = normalizeConnectorList(input.connectors);
  if (!connectors) {
    return invalidHeartbeat("invalid_connector_snapshot");
  }

  return {
    value: {
      schemaVersion: EXECUTOR_CAPABILITY_SCHEMA_VERSION,
      executorId: input.executorId,
      ...(input.executorSessionId ? { executorSessionId: input.executorSessionId } : {}),
      connectors
    }
  };
}

export function describeConnectorRuntime({ registry, heartbeats = [], probes = [], now = Date.now() }) {
  const serverDescription = describeConnectorRegistry(registry);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const executors = heartbeats
    .map((heartbeat) => publicExecutorHeartbeat(heartbeat, nowMs))
    .filter(Boolean)
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));

  const runtimeConnectors = serverDescription.connectors.map((serverConnector) =>
    mergeConnectorRuntime(serverConnector, executors, probes, nowMs)
  );

  return {
    connectors: serverDescription.connectors,
    issues: serverDescription.issues,
    executorRuntime: {
      connectors: runtimeConnectors,
      executors,
      summary: {
        online: executors.filter((executor) => executor.status === "online").length,
        stale: executors.filter((executor) => executor.status === "stale").length,
        total: executors.length
      }
    }
  };
}

export function normalizeTargetVerificationRequest(input) {
  if (
    !plainObject(input)
    || !onlyKeys(input, ["schemaVersion", "requirements"])
    || input.schemaVersion !== TARGET_VERIFICATION_SCHEMA_VERSION
    || !Array.isArray(input.requirements)
    || input.requirements.length < 1
    || input.requirements.length > TARGET_VERIFICATION_LIMIT
  ) {
    return { error: "invalid_target_verification_request" };
  }

  const requirements = [];
  const seen = new Set();
  for (const value of input.requirements) {
    const requirement = normalizeTargetVerificationRequirement(value);
    if (!requirement) return { error: "invalid_target_verification_request" };
    const key = [
      requirement.platform,
      requirement.operation,
      requirement.qualifier
    ].join(":");
    if (seen.has(key)) return { error: "duplicate_target_verification_requirement" };
    seen.add(key);
    requirements.push(requirement);
  }

  return {
    value: {
      schemaVersion: TARGET_VERIFICATION_SCHEMA_VERSION,
      requirements
    }
  };
}

export function verifyConnectorTargetRequirements({
  registry,
  heartbeats = [],
  probes = [],
  subjectSecret,
  requirements = [],
  now = Date.now()
}) {
  const serverDescription = describeConnectorRegistry(registry);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const executors = heartbeats
    .map((heartbeat) => publicExecutorHeartbeat(heartbeat, nowMs))
    .filter(Boolean);
  const normalizedProbes = probes.map(normalizeConnectorProbeEvidence).filter(Boolean);

  return {
    schemaVersion: TARGET_VERIFICATION_SCHEMA_VERSION,
    results: requirements.map((requirement) => {
      const serverConnector = serverDescription.connectors.find((item) => item.platform === requirement.platform);
      const selected = serverConnector
        ? selectConnectorReport(connectorReports(serverConnector, executors))
        : null;
      const binding = buildConnectorProbeBinding({
        platform: requirement.platform,
        operation: requirement.operation,
        input: {
          owner: requirement.target.owner,
          repo: requirement.target.repo,
          scope: requirement.qualifier
        },
        subjectSecret
      });
      const targetProbe = selected && binding
        ? latestTargetProbe({
          probes: normalizedProbes,
          selected,
          requirement,
          subjectKey: binding.subjectKey
        })
        : null;
      const verified = Boolean(
        selected
        && binding
        && selected.executor.trusted === true
        && selected.connector.status === "available"
        && selected.connector.mode === "private"
        && privateCapabilityAvailable(selected.connector, requirement.operation)
        && targetProbe?.outcome === "verified"
        && new Date(targetProbe.expiresAt).getTime() > nowMs
      );
      return {
        platform: requirement.platform,
        operation: publicTargetOperation(requirement),
        status: verified ? "verified" : "unverified",
        reason: verified ? "target_probe_verified" : "target_probe_unverified"
      };
    })
  };
}

function normalizeConnectorList(value) {
  if (!Array.isArray(value) || value.length > Object.keys(PLATFORM_CONTRACTS).length) {
    return null;
  }

  const seen = new Set();
  const connectors = [];
  for (const item of value) {
    const connector = normalizeConnector(item);
    if (!connector || seen.has(connector.platform)) {
      return null;
    }
    seen.add(connector.platform);
    connectors.push(connector);
  }
  return connectors.sort((left, right) => left.platform.localeCompare(right.platform));
}

function normalizeConnector(value) {
  if (!plainObject(value) || !onlyKeys(value, ["platform", "status", "mode", "capabilities", "issues"])) {
    return null;
  }
  if (!Object.hasOwn(PLATFORM_CONTRACTS, value.platform)) {
    return null;
  }
  if (!CONNECTOR_STATUSES.has(value.status) || !CONNECTOR_MODES.has(value.mode)) {
    return null;
  }

  const expectedCapabilities = PLATFORM_CONTRACTS[value.platform];
  if (!Array.isArray(value.capabilities) || value.capabilities.length !== expectedCapabilities.length) {
    return null;
  }
  const capabilities = [];
  const seenCapabilities = new Set();
  for (const item of value.capabilities) {
    if (!plainObject(item) || !onlyKeys(item, ["name", "available", "mode"])) {
      return null;
    }
    if (
      !expectedCapabilities.includes(item.name)
      || seenCapabilities.has(item.name)
      || typeof item.available !== "boolean"
      || !CAPABILITY_MODE_PATTERN.test(item.mode || "")
    ) {
      return null;
    }
    seenCapabilities.add(item.name);
    capabilities.push({
      name: item.name,
      available: item.available,
      mode: item.mode
    });
  }
  if (expectedCapabilities.some((capability) => !seenCapabilities.has(capability))) {
    return null;
  }
  const requiredCapabilities = PLATFORM_REQUIRED_CAPABILITIES[value.platform];
  if (
    (value.status === "available" && requiredCapabilities.some((name) => !capabilities.find((item) => item.name === name)?.available))
    || (value.status === "reserved" && capabilities.some((item) => item.available))
  ) {
    return null;
  }

  if (!Array.isArray(value.issues) || value.issues.length > 32) {
    return null;
  }
  const issues = [];
  for (const item of value.issues) {
    if (!plainObject(item) || !onlyKeys(item, ["severity", "code", "capability", "reason"])) {
      return null;
    }
    if (!ISSUE_SEVERITIES.has(item.severity) || !ISSUE_CODES.has(item.code)) {
      return null;
    }
    if (item.capability !== undefined && !expectedCapabilities.includes(item.capability)) {
      return null;
    }
    if (item.reason !== undefined && !ISSUE_REASONS.has(item.reason)) {
      return null;
    }
    issues.push({
      severity: item.severity,
      code: item.code,
      ...(item.capability ? { capability: item.capability } : {}),
      ...(item.reason ? { reason: item.reason } : {})
    });
  }

  return {
    platform: value.platform,
    status: value.status,
    mode: value.mode,
    capabilities: expectedCapabilities.map((name) => capabilities.find((item) => item.name === name)),
    issues
  };
}

function publicConnectorDescriptor(connector) {
  return {
    platform: connector.platform,
    status: connector.status,
    mode: connector.mode,
    capabilities: connector.capabilities.map((capability) => ({
      name: capability.name,
      available: capability.available,
      mode: CAPABILITY_MODE_PATTERN.test(capability.mode || "") ? capability.mode : "mock"
    })),
    issues: (connector.issues || []).map((issue) => ({
      severity: ISSUE_SEVERITIES.has(issue.severity) ? issue.severity : "error",
      code: ISSUE_CODES.has(issue.code) ? issue.code : "connector_contract_failed",
      ...(issue.capability && PLATFORM_CONTRACTS[connector.platform].includes(issue.capability)
        ? { capability: issue.capability }
        : {}),
      ...(ISSUE_REASONS.has(issue.reason) ? { reason: issue.reason } : {})
    }))
  };
}

function publicExecutorHeartbeat(heartbeat, nowMs) {
  const normalized = normalizeExecutorCapabilityHeartbeat({
    schemaVersion: heartbeat?.schemaVersion,
    executorId: heartbeat?.executorId,
    ...(heartbeat?.executorSessionId ? { executorSessionId: heartbeat.executorSessionId } : {}),
    connectors: heartbeat?.connectors
  });
  if (!normalized.value || !validIso(heartbeat?.lastSeenAt) || !validIso(heartbeat?.expiresAt)) {
    return null;
  }

  const value = {
    ...normalized.value,
    trusted: heartbeat?.trusted === true,
    sessionBound: Boolean(heartbeat?.executorSessionId),
    status: new Date(heartbeat.expiresAt).getTime() > nowMs ? "online" : "stale",
    lastSeenAt: heartbeat.lastSeenAt,
    expiresAt: heartbeat.expiresAt
  };
  delete value.executorSessionId;
  Object.defineProperty(value, "executorSessionId", {
    value: heartbeat?.executorSessionId || "",
    enumerable: false
  });
  return value;
}

function mergeConnectorRuntime(serverConnector, executors, probes, nowMs) {
  const reports = connectorReports(serverConnector, executors);
  const onlineReports = reports.filter((report) => report.executor.status === "online");
  const selected = selectConnectorReport(reports);
  const visibleReports = onlineReports.length > 0 ? onlineReports : reports;
  const runtimeStatus = onlineReports.length > 0 ? "online" : (reports.length > 0 ? "stale" : "unreported");
  const runtime = {
    status: runtimeStatus,
    executorIds: visibleReports.map((report) => report.executor.executorId).sort(),
    lastSeenAt: visibleReports
      .map((report) => report.executor.lastSeenAt)
      .sort()
      .at(-1) || null
  };
  const contractStatus = serverConnector.status === "available"
    ? "implemented"
    : (serverConnector.status === "reserved" ? "reserved" : "invalid");
  const evidence = {
    contract: contractStatus,
    executor: runtimeStatus,
    probe: "not_run"
  };

  const probe = describeProbeRuntime({
    selected,
    reports,
    probes,
    platform: serverConnector.platform,
    nowMs
  });
  evidence.probe = probe.status;

  if (!selected) {
    return {
      ...serverConnector,
      source: "server_registry",
      runtime,
      evidence,
      probe,
      verifiedOperations: [],
      operationalStatus: "unverified",
      canRunReal: false
    };
  }

  return {
    ...selected.connector,
    capabilities: selected.connector.capabilities.map((capability) => ({
      ...capability,
      method: CONNECTOR_METHODS[capability.name],
      required: PLATFORM_REQUIRED_CAPABILITIES[selected.connector.platform].includes(capability.name)
    })),
    source: "executor",
    baselineStatus: serverConnector.status,
    baselineMode: serverConnector.mode,
    runtime,
    evidence,
    probe,
    verifiedOperations: probe.verifiedOperations,
    operationalStatus: operationalStatusForProbe(probe.status),
    canRunReal: probe.status === "verified" && probe.verifiedOperations.length > 0
  };
}

function connectorReports(serverConnector, executors) {
  return executors.flatMap((executor) => {
    const connector = executor.connectors.find((item) => item.platform === serverConnector.platform);
    return connector ? [{ executor, connector }] : [];
  });
}

function selectConnectorReport(reports) {
  return reports
    .filter((report) => report.executor.status === "online")
    .sort((left, right) =>
      connectorScore(right.connector) - connectorScore(left.connector)
        || right.executor.lastSeenAt.localeCompare(left.executor.lastSeenAt)
    )[0] || null;
}

function normalizeTargetVerificationRequirement(value) {
  if (
    !plainObject(value)
    || !onlyKeys(value, ["platform", "operation", "qualifier", "target"])
    || value.platform !== "github"
    || value.operation !== "check_auth"
    || !plainObject(value.target)
    || !onlyKeys(value.target, ["owner", "repo"])
  ) {
    return null;
  }
  const target = normalizeGitHubProbeTarget({
    owner: value.target.owner,
    repo: value.target.repo,
    scope: value.qualifier
  });
  if (!target) return null;
  return {
    platform: "github",
    operation: "check_auth",
    qualifier: target.scope,
    target: { owner: target.owner, repo: target.repo }
  };
}

function latestTargetProbe({ probes, selected, requirement, subjectKey }) {
  const matches = probes.filter((item) =>
    item.executorId === selected.executor.executorId
    && item.executorSessionId === selected.executor.executorSessionId
    && item.platform === requirement.platform
    && item.operation === requirement.operation
    && item.qualifier === requirement.qualifier
    && connectorProbeSubjectMatches(item.subjectKey, subjectKey)
  );
  return matches.sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0] || null;
}

function publicTargetOperation(requirement) {
  return `${requirement.operation}:${requirement.qualifier}:target_bound`;
}

function describeProbeRuntime({ selected, reports, probes, platform, nowMs }) {
  const valid = probes
    .map(normalizeConnectorProbeEvidence)
    .filter(Boolean)
    .filter((item) => item.platform === platform);
  const executorIds = new Set(reports.map((report) => report.executor.executorId));
  const related = valid.filter((item) => selected
    ? item.executorId === selected.executor.executorId
      && item.executorSessionId === selected.executor.executorSessionId
    : executorIds.has(item.executorId));
  const latest = latestProbePerOperation(related);
  const publicOperations = latest.map((item) => ({
    operation: item.operation,
    ...(item.qualifier ? { qualifier: item.qualifier } : {}),
    subjectBound: Boolean(item.subjectKey),
    capability: item.capability,
    outcome: item.outcome,
    issueCode: item.issueCode,
    taskId: item.taskId,
    checkedAt: item.checkedAt,
    expiresAt: item.expiresAt,
    freshness: new Date(item.expiresAt).getTime() > nowMs ? "fresh" : "stale"
  }));
  const latestEvidence = [...latest].sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0];

  if (!selected || latest.length === 0) {
    return {
      status: latest.length > 0 ? "stale" : "not_run",
      checkedAt: latestEvidence?.checkedAt || null,
      expiresAt: latestEvidence?.expiresAt || null,
      verifiedOperations: [],
      operations: publicOperations
    };
  }

  const fresh = latest.filter((item) => new Date(item.expiresAt).getTime() > nowMs);
  if (fresh.length === 0) {
    return {
      status: "stale",
      checkedAt: latestEvidence.checkedAt,
      expiresAt: latestEvidence.expiresAt,
      verifiedOperations: [],
      operations: publicOperations
    };
  }

  const currentPrivate = selected.executor.trusted === true
    && selected.connector.status === "available"
    && selected.connector.mode === "private";
  const verifiedOperations = currentPrivate
    ? fresh
      .filter((item) => item.outcome === "verified" && privateCapabilityAvailable(selected.connector, item.capability))
      .map(publicVerifiedOperation)
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort()
    : [];
  const status = fresh.some((item) => item.outcome === "blocked")
    ? "blocked"
    : fresh.some((item) => item.outcome === "action_required")
      ? "action_required"
      : fresh.some((item) => item.outcome === "unverified") || !currentPrivate
        ? "unverified"
        : verifiedOperations.length > 0
          ? "verified"
          : "unverified";
  const statusEvidence = fresh
    .filter((item) => status === "verified" ? item.outcome === "verified" : item.outcome === status)
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0]
    || [...fresh].sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0];
  return {
    status,
    checkedAt: statusEvidence?.checkedAt || null,
    expiresAt: statusEvidence?.expiresAt || null,
    issueCode: statusEvidence?.issueCode || "",
    verifiedOperations,
    operations: publicOperations
  };
}

function latestProbePerOperation(values) {
  const latest = new Map();
  for (const item of values) {
    const key = [item.operation, item.qualifier, item.subjectKey].join(":");
    const existing = latest.get(key);
    if (!existing || existing.checkedAt <= item.checkedAt) latest.set(key, item);
  }
  return [...latest.values()].sort((left, right) =>
    publicVerifiedOperation(left).localeCompare(publicVerifiedOperation(right))
  );
}

function publicVerifiedOperation(evidence) {
  if (!evidence.qualifier) return evidence.operation;
  return `${evidence.operation}:${evidence.qualifier}:target_verification_required:v1`;
}

function privateCapabilityAvailable(connector, capability) {
  const item = connector.capabilities.find((entry) => entry.name === capability);
  return item?.available === true && !["mock", "reserved"].includes(item.mode);
}

function operationalStatusForProbe(status) {
  return {
    verified: "verified",
    action_required: "action_required",
    blocked: "blocked"
  }[status] || "unverified";
}

function connectorScore(connector) {
  const statusScore = connector.status === "available" ? 100 : (connector.status === "reserved" ? 10 : 0);
  const modeScore = connector.mode === "private" ? 20 : (connector.mode === "reserved" ? 0 : 10);
  return statusScore + modeScore;
}

function onlyKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validExecutorId(value) {
  return typeof value === "string" && EXECUTOR_ID_PATTERN.test(value);
}

function validExecutorSessionId(value) {
  return typeof value === "string" && EXECUTOR_SESSION_ID_PATTERN.test(value);
}

function validIso(value) {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));
}

function invalidHeartbeat(reason) {
  return { error: "invalid_executor_heartbeat", reason };
}
