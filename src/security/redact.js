import { normalizeAiLinkAudit } from "../audit/aiLinkAudit.js";

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|authorization|cookie|credential|csrf|jwt|login|password|private|secret|session|token)/i;
const LONG_SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9+/]{32,}={0,2})\b/g;
const PUBLIC_SESSION_STATES = new Set([
  "not_required",
  "valid",
  "missing",
  "expired",
  "verification_required",
  "blocked"
]);

export function redactText(value) {
  if (typeof value !== "string") return value;
  return value.replace(LONG_SECRET_PATTERN, "[redacted-secret]");
}

export function redact(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (key === "session") {
          return [key, publicSessionStatus(item) || "[redacted]"];
        }
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, "[redacted]"];
        }
        if (/^(rawHtml|rawText|rawResponse|raw_response|screenshot|qrCode|qr_code|cookieJar|browserProfile|localStorage)$/i.test(key)) {
          return [key, "[redacted-content]"];
        }
        return [key, redact(item)];
      })
    );
  }

  return redactText(value);
}

function publicSessionStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!PUBLIC_SESSION_STATES.has(value.state)) return null;
  if (typeof value.checked_at !== "string" || value.checked_at.length > 64 || Number.isNaN(Date.parse(value.checked_at))) {
    return null;
  }
  return {
    state: value.state,
    checked_at: value.checked_at
  };
}

export function publicTask(task) {
  if (!task) return null;
  const result = redact(task.result || null);
  if (task.result?.aiLinkAudit && result && typeof result === "object" && !Array.isArray(result)) {
    result.aiLinkAudit = task.result.aiLinkAudit;
  }
  return {
    ...task,
    input: redact(task.input),
    options: redact(task.options || {}),
    result,
    error: redact(task.error || null)
  };
}

export function publicAuditEvent(event) {
  const redacted = redact(event);
  const safeAudit = normalizeAiLinkAudit(event?.detail?.audit);
  if (
    event?.eventType === "ai_link.audit"
    && event.detail?.audit
    && redacted?.detail
    && typeof redacted.detail === "object"
    && !Array.isArray(redacted.detail)
  ) {
    if (safeAudit) {
      redacted.detail.audit = safeAudit;
    } else {
      delete redacted.detail.audit;
    }
  }
  return redacted;
}
