const SESSION_STATE_VALUES = [
  "not_required",
  "valid",
  "missing",
  "expired",
  "verification_required",
  "blocked"
];

export const SESSION_STATES = Object.freeze(SESSION_STATE_VALUES);
export const PLATFORM_RESULT_STATUSES = Object.freeze(["ready", "needs_action", "blocked"]);

export const PLATFORM_AUTH_OPERATIONS = Object.freeze({
  xiaohongshu: Object.freeze({
    check_session: Object.freeze({ method: "checkSession", mode: "read_only" }),
    begin_login: Object.freeze({ method: "beginLogin", mode: "interactive" }),
    search_content: Object.freeze({ method: "readContent", mode: "read_only" })
  }),
  wechat_official: Object.freeze({
    check_health: Object.freeze({ method: "checkHealth", mode: "read_only" })
  }),
  github: Object.freeze({
    check_auth: Object.freeze({ method: "checkAuth", mode: "read_only" })
  })
});

const PUBLIC_ISSUES = Object.freeze({
  login_required: Object.freeze({ action: "complete_login_in_local_browser", retryable: true }),
  login_expired: Object.freeze({ action: "renew_login_in_local_browser", retryable: true }),
  captcha_required: Object.freeze({ action: "complete_captcha_in_local_browser", retryable: true }),
  verification_required: Object.freeze({ action: "complete_verification_in_local_browser", retryable: true }),
  credential_missing: Object.freeze({ action: "configure_official_api_credentials", retryable: true }),
  credential_invalid: Object.freeze({ action: "replace_official_api_credentials", retryable: true }),
  official_api_ip_not_whitelisted: Object.freeze({ action: "configure_official_api_ip_allowlist", retryable: true }),
  official_api_rate_limited: Object.freeze({ action: "retry_after_backoff", retryable: true }),
  official_api_unavailable: Object.freeze({ action: "retry_when_official_api_recovers", retryable: true }),
  platform_rate_limited: Object.freeze({ action: "retry_after_backoff", retryable: true }),
  connector_missing: Object.freeze({ action: "install_or_enable_private_connector", retryable: false }),
  connector_contract_failed: Object.freeze({ action: "repair_private_connector_contract", retryable: false }),
  specific_content_missing: Object.freeze({ action: "retry_with_a_more_specific_query", retryable: true }),
  source_unreachable: Object.freeze({ action: "verify_source_reachability", retryable: true })
});

const SESSION_STATE_SET = new Set(SESSION_STATES);
const RESULT_STATUS_SET = new Set(PLATFORM_RESULT_STATUSES);
const XHS_HOSTS = new Set(["xiaohongshu.com", "www.xiaohongshu.com"]);
const XHS_CONTENT_PATH = /^\/(?:explore|discovery\/item)\/[A-Za-z0-9_-]+\/?$/;

export function getPlatformAuthOperation(platform, operation) {
  return PLATFORM_AUTH_OPERATIONS[platform]?.[operation] || null;
}

export function publicIssueForCode(code) {
  return PUBLIC_ISSUES[code] || null;
}

export function normalizePlatformConnectorResult(value, {
  platform,
  operation,
  clock = () => new Date()
} = {}) {
  if (!getPlatformAuthOperation(platform, operation) || !isPlainObject(value)) {
    throw contractError(platform, "invalid_result_shape");
  }
  if (value.schema_version !== undefined && value.schema_version !== "1") {
    throw contractError(platform, "unsupported_schema_version");
  }
  if (value.platform !== undefined && value.platform !== platform) {
    throw contractError(platform, "result_platform_mismatch");
  }
  if (value.operation !== undefined && value.operation !== operation) {
    throw contractError(platform, "result_operation_mismatch");
  }

  let status = String(value.status || "");
  if (!RESULT_STATUS_SET.has(status)) {
    throw contractError(platform, "invalid_result_status");
  }

  const session = normalizeSession(value.session, { platform, status, clock });
  const items = normalizeItems(value.items, { platform });
  const emptyReadySearch = platform === "xiaohongshu"
    && operation === "search_content"
    && status === "ready"
    && items.length === 0;

  if (emptyReadySearch) {
    status = "blocked";
  }

  if (["xiaohongshu", "github"].includes(platform) && status === "ready" && session.state !== "valid") {
    throw contractError(platform, "ready_session_not_valid");
  }

  const actionRequired = status === "ready"
    ? null
    : normalizeActionRequired(
        emptyReadySearch
          ? { code: "specific_content_missing" }
          : value.action_required,
        { platform }
      );

  return {
    schema_version: "1",
    platform,
    operation,
    status,
    session,
    items,
    action_required: actionRequired,
    diagnostics: normalizeDiagnostics(value.diagnostics, items.length)
  };
}

function normalizeSession(value, { platform, clock }) {
  if (!isPlainObject(value)) {
    throw contractError(platform, "session_status_missing");
  }

  const state = String(value.state || "");
  if (!SESSION_STATE_SET.has(state)) {
    throw contractError(platform, "invalid_session_state");
  }

  const checkedAt = value.checked_at || clock().toISOString();
  if (!isTimestamp(checkedAt)) {
    throw contractError(platform, "invalid_session_timestamp");
  }

  return {
    state,
    checked_at: String(checkedAt)
  };
}

function normalizeItems(value, { platform }) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) {
    throw contractError(platform, "invalid_item_count");
  }
  return value.map((item) => normalizeItem(item, { platform }));
}

function normalizeItem(value, { platform }) {
  if (!isPlainObject(value) || value.source_platform !== platform) {
    throw contractError(platform, "invalid_source_platform");
  }

  const sourceUrl = normalizeSourceUrl(value.source_url, { platform });
  const title = limitedText(value.title, 200, { platform });
  const summary = limitedText(value.summary, 500, { allowEmpty: true, platform });
  const publishedAt = value.published_at ? String(value.published_at) : "";
  if (publishedAt && !isTimestamp(publishedAt)) {
    throw contractError(platform, "invalid_published_timestamp");
  }

  const acquisitionProvider = String(value.acquisition_provider || "");
  if (!/^[a-z0-9_.-]{1,80}$/.test(acquisitionProvider)) {
    throw contractError(platform, "invalid_acquisition_provider");
  }
  if (platform === "xiaohongshu" && acquisitionProvider !== "ai_link_xhs_readonly") {
    throw contractError(platform, "invalid_acquisition_provider");
  }

  if (!isPlainObject(value.source_reachability) || value.source_reachability.status !== "verified") {
    throw contractError(platform, "source_not_verified");
  }

  return {
    source_platform: platform,
    source_url: sourceUrl,
    title,
    summary,
    published_at: publishedAt,
    acquisition_provider: acquisitionProvider,
    source_reachability: {
      status: "verified",
      method: limitedText(value.source_reachability.method, 80, { platform })
    }
  };
}

function normalizeSourceUrl(value, { platform }) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw contractError(platform, "invalid_source_url");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw contractError(platform, "invalid_source_url");
  }

  if (platform === "xiaohongshu") {
    if (!XHS_HOSTS.has(url.hostname.toLowerCase()) || !XHS_CONTENT_PATH.test(url.pathname)) {
      throw contractError(platform, "specific_content_missing");
    }
    url.search = "";
    url.hash = "";
  }

  return url.toString();
}

function normalizeActionRequired(value, { platform }) {
  if (!isPlainObject(value)) {
    throw contractError(platform, "action_required_missing");
  }
  const code = String(value.code || "");
  const issue = publicIssueForCode(code);
  if (!issue) {
    throw contractError(platform, "invalid_action_code");
  }
  return {
    code,
    action: issue.action,
    retryable: issue.retryable
  };
}

function normalizeDiagnostics(value, itemCount) {
  const source = isPlainObject(value) ? value : {};
  const diagnostics = { item_count: itemCount };

  const durationMs = boundedInteger(source.duration_ms, 0, 600000);
  if (durationMs !== null) diagnostics.duration_ms = durationMs;

  const retryAfter = boundedInteger(source.retry_after_seconds, 0, 86400);
  if (retryAfter !== null) diagnostics.retry_after_seconds = retryAfter;

  if (Array.isArray(source.issue_codes)) {
    diagnostics.issue_codes = [...new Set(source.issue_codes)]
      .filter((code) => typeof code === "string" && publicIssueForCode(code))
      .slice(0, 10);
  }

  return diagnostics;
}

function limitedText(value, limit, { allowEmpty = false, platform = "" } = {}) {
  const text = String(value || "").trim();
  if (!allowEmpty && !text) {
    throw contractError(platform, "required_text_missing");
  }
  return text.slice(0, limit);
}

function boundedInteger(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function isTimestamp(value) {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function contractError(platform, reason) {
  const error = new Error("Private connector returned an invalid public result.");
  error.code = "connector_contract_failed";
  error.platform = platform || "";
  error.reason = reason;
  error.retryable = false;
  return error;
}
