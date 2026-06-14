import { redactText } from "../security/redact.js";

const RUN_STRING_FIELDS = [
  "task",
  "provider",
  "providerType",
  "model",
  "policy",
  "allowOutbound",
  "policyDataClass"
];

const STAGE_STRING_FIELDS = ["name", "task", "source"];
const APPROVAL_MODES = new Set(["always", "live"]);

export function extractAiLinkAudit(body = {}) {
  const candidate = body.audit || body.result?.aiLinkAudit || body.result?.audit;
  return normalizeAiLinkAudit(candidate);
}

export function attachAiLinkAudit(result, audit) {
  if (!audit) {
    return result;
  }
  return {
    ...(result && typeof result === "object" && !Array.isArray(result) ? result : {}),
    aiLinkAudit: audit
  };
}

export function normalizeAiLinkAudit(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.kind === "workflow" && Array.isArray(value.stages)) {
    return {
      kind: "workflow",
      workflow: cleanString(value.workflow),
      dryRun: cleanBoolean(value.dryRun),
      stages: value.stages
        .map(normalizeStageAudit)
        .filter(Boolean)
    };
  }

  return normalizeRunAudit(value);
}

function normalizeStageAudit(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  const stage = {};
  for (const field of STAGE_STRING_FIELDS) {
    const cleaned = cleanString(value[field]);
    if (cleaned) {
      stage[field] = cleaned;
    }
  }

  const approval = normalizeApproval(value.approval);
  if (approval) {
    stage.approval = approval;
  }

  const result = normalizeRunAudit(value.result);
  if (result) {
    stage.result = result;
  }

  return Object.keys(stage).length > 0 ? stage : undefined;
}

function normalizeRunAudit(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  const audit = {
    kind: "run"
  };

  for (const field of RUN_STRING_FIELDS) {
    const cleaned = cleanString(value[field]);
    if (cleaned) {
      audit[field] = cleaned;
    }
  }

  if (typeof value.dryRun === "boolean") {
    audit.dryRun = value.dryRun;
  }

  const tags = cleanStringArray(value.policyAuditTags);
  if (tags.length > 0) {
    audit.policyAuditTags = tags;
  }

  const budget = normalizeBudget(value.policyBudget);
  if (budget) {
    audit.policyBudget = budget;
  }

  const usage = normalizeUsageEstimate(value.usageEstimate);
  if (usage) {
    audit.usageEstimate = usage;
  }

  const approval = normalizeApproval(value.approval);
  if (approval) {
    audit.approval = approval;
  }

  return Object.keys(audit).length > 1 ? audit : undefined;
}

function normalizeBudget(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  return cleanNumberObject(value, [
    "maxInputChars",
    "maxInputTokens",
    "maxOutputTokens",
    "maxEstimatedCostUsd"
  ]);
}

function normalizeUsageEstimate(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  return cleanNumberObject(value, [
    "inputChars",
    "inputTokens",
    "outputTokens",
    "estimatedCostUsd"
  ]);
}

function normalizeApproval(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  const approval = {};
  for (const field of ["required", "approved", "enforced"]) {
    if (typeof value[field] === "boolean") {
      approval[field] = value[field];
    }
  }

  if (APPROVAL_MODES.has(value.mode)) {
    approval.mode = value.mode;
  }

  const reason = cleanString(value.reason);
  if (reason) {
    approval.reason = reason;
  }

  return Object.keys(approval).length > 0 ? approval : undefined;
}

function cleanNumberObject(value, fields) {
  const output = {};
  for (const field of fields) {
    const numberValue = value[field];
    if (typeof numberValue === "number" && Number.isFinite(numberValue)) {
      output[field] = numberValue;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(cleanString)
    .filter(Boolean);
}

function cleanString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return redactText(value).slice(0, 500);
}

function cleanBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
