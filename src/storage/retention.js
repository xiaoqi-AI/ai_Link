import crypto from "node:crypto";
import { TASK_STATUSES } from "../domain/workflow.js";

export const RETENTION_POLICY_VERSION = "1";
export const RETENTION_RECOVERY_BOUNDARY = "rollback-before-commit; backup-or-pitr-after-commit";
export const TERMINAL_TASK_STATUSES = Object.freeze([
  TASK_STATUSES.COMPLETED,
  TASK_STATUSES.FAILED,
  TASK_STATUSES.CANCELLED
]);

export const DEFAULT_RETENTION_POLICY = Object.freeze({
  artifactDays: 7,
  approvalDays: 7,
  auditDays: 180,
  maintenanceAuditDays: 365,
  heartbeatGraceHours: 24,
  probeGraceDays: 7,
  maxRowsPerTable: 500
});

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ACTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$/;

export function normalizeRetentionPolicy(value = {}) {
  const auditDays = boundedInteger(value.auditDays, DEFAULT_RETENTION_POLICY.auditDays, 30, 3650);
  const maintenanceAuditDays = Math.max(
    auditDays,
    boundedInteger(
      value.maintenanceAuditDays,
      DEFAULT_RETENTION_POLICY.maintenanceAuditDays,
      90,
      3650
    )
  );
  return {
    artifactDays: boundedInteger(value.artifactDays, DEFAULT_RETENTION_POLICY.artifactDays, 1, 365),
    approvalDays: boundedInteger(value.approvalDays, DEFAULT_RETENTION_POLICY.approvalDays, 1, 90),
    auditDays,
    maintenanceAuditDays,
    heartbeatGraceHours: boundedInteger(
      value.heartbeatGraceHours,
      DEFAULT_RETENTION_POLICY.heartbeatGraceHours,
      1,
      168
    ),
    probeGraceDays: boundedInteger(value.probeGraceDays, DEFAULT_RETENTION_POLICY.probeGraceDays, 1, 90),
    maxRowsPerTable: boundedInteger(
      value.maxRowsPerTable,
      DEFAULT_RETENTION_POLICY.maxRowsPerTable,
      1,
      1000
    )
  };
}

export function normalizeRetentionRequest({
  apply = false,
  backupConfirmed = false,
  actor = "maintenance:cli",
  policy = {},
  maxRowsPerTable,
  now
} = {}) {
  const normalizedPolicy = normalizeRetentionPolicy({
    ...policy,
    ...(maxRowsPerTable == null ? {} : { maxRowsPerTable })
  });
  const normalizedActor = String(actor || "").trim();
  if (!ACTOR_PATTERN.test(normalizedActor)) {
    throw new Error("Retention actor has an invalid format.");
  }
  if (apply === true && backupConfirmed !== true) {
    throw new Error("Retention apply requires explicit backup or PITR confirmation.");
  }
  const asOfDate = now == null ? new Date() : new Date(now);
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error("Retention timestamp is invalid.");
  }
  return {
    apply: apply === true,
    actor: normalizedActor,
    policy: normalizedPolicy,
    asOf: asOfDate.toISOString(),
    runId: crypto.randomUUID()
  };
}

export function retentionCutoffs(asOf, policy) {
  const asOfMs = new Date(asOf).getTime();
  return {
    artifact: new Date(asOfMs - policy.artifactDays * DAY_MS).toISOString(),
    approval: new Date(asOfMs - policy.approvalDays * DAY_MS).toISOString(),
    audit: new Date(asOfMs - policy.auditDays * DAY_MS).toISOString(),
    maintenanceAudit: new Date(asOfMs - policy.maintenanceAuditDays * DAY_MS).toISOString(),
    heartbeat: new Date(asOfMs - policy.heartbeatGraceHours * HOUR_MS).toISOString(),
    probe: new Date(asOfMs - policy.probeGraceDays * DAY_MS).toISOString()
  };
}

export function approvalExpiresAt(now, policy) {
  const normalized = normalizeRetentionPolicy(policy);
  return new Date(new Date(now).getTime() + normalized.approvalDays * DAY_MS).toISOString();
}

export function emptyRetentionCounts() {
  return {
    approvals: 0,
    artifacts: 0,
    executorHeartbeats: 0,
    connectorProbes: 0,
    auditEvents: 0
  };
}

export function retentionResult({ request, candidates, changed, hasMore, cutoffs }) {
  return {
    mode: request.apply ? "apply" : "dry-run",
    runId: request.runId,
    asOf: request.asOf,
    policyVersion: RETENTION_POLICY_VERSION,
    policy: request.policy,
    cutoffs,
    candidates,
    changed,
    hasMore: hasMore === true,
    protectedResources: ["tasks", "apiTokens", "platformAccounts", "privateLoginState"],
    recoveryBoundary: RETENTION_RECOVERY_BOUNDARY
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}
