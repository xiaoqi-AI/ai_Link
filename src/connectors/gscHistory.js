import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const HISTORY_SCHEMA = "ai-link-gsc-history-v1";
const DEFAULT_HISTORY_LIMIT = 90;
const MAX_HISTORY_LIMIT = 365;
const MAX_HISTORY_BYTES = 2 * 1024 * 1024;
const PROBLEM_STATUSES = new Set([
  "blocked_by_robots",
  "sitemap_error",
  "manual_action_required"
]);

export function createGscSnapshot(result = {}) {
  const urls = Array.isArray(result.urls) ? result.urls : [];
  return sanitizeStoredSnapshot({
    schema: HISTORY_SCHEMA,
    checkedAt: String(result.checkedAt || ""),
    siteUrl: String(result.siteUrl || ""),
    summary: {
      counts: sanitizeCounts(result.summary?.counts)
    },
    urls: urls.map((item) => ({
      url: String(item.url || ""),
      status: String(item.status || "ready_for_google"),
      publicReady: item.publicReady === true,
      httpStatus: Number(item.httpStatus) || 0,
      robotsAllowed: item.robotsAllowed === true,
      sitemapIncluded: item.sitemapIncluded === true,
      canonicalMatches: item.canonicalMatches === true,
      noindex: item.noindex === true,
      lastCrawlTime: String(item.inspection?.lastCrawlTime || "")
    })),
    issues: sanitizeIssues(result.globalIssues)
  });
}

export function compareGscSnapshots(previous, current) {
  if (!previous) {
    return {
      baseline: true,
      previousCheckedAt: "",
      currentCheckedAt: current.checkedAt,
      summary: emptyChangeCounts(),
      items: []
    };
  }
  assertSnapshot(previous, current.siteUrl);
  assertSnapshot(current, current.siteUrl);

  const items = [];
  const previousUrls = new Map(previous.urls.map((item) => [item.url, item]));
  const currentUrls = new Map(current.urls.map((item) => [item.url, item]));

  for (const [url, currentItem] of currentUrls) {
    const previousItem = previousUrls.get(url);
    if (!previousItem) {
      items.push({ type: "url_added", direction: "changed", url, fromStatus: "", toStatus: currentItem.status });
      continue;
    }
    if (previousItem.status !== currentItem.status) {
      items.push({
        type: "status_changed",
        direction: statusDirection(previousItem.status, currentItem.status),
        url,
        fromStatus: previousItem.status,
        toStatus: currentItem.status
      });
    } else if (previousItem.publicReady !== currentItem.publicReady) {
      items.push({
        type: "public_readiness_changed",
        direction: currentItem.publicReady ? "improved" : "regressed",
        url,
        fromStatus: previousItem.publicReady ? "public_ready" : "public_not_ready",
        toStatus: currentItem.publicReady ? "public_ready" : "public_not_ready"
      });
    }
  }

  for (const [url, previousItem] of previousUrls) {
    if (!currentUrls.has(url)) {
      items.push({ type: "url_removed", direction: "changed", url, fromStatus: previousItem.status, toStatus: "" });
    }
  }

  const previousIssues = new Map(previous.issues.map((item) => [issueKey(item), item]));
  const currentIssues = new Map(current.issues.map((item) => [issueKey(item), item]));
  for (const [key, item] of currentIssues) {
    if (!previousIssues.has(key)) {
      items.push({ type: "issue_added", direction: "regressed", url: item.url, code: item.code });
    }
  }
  for (const [key, item] of previousIssues) {
    if (!currentIssues.has(key)) {
      items.push({ type: "issue_resolved", direction: "improved", url: item.url, code: item.code });
    }
  }

  return {
    baseline: false,
    previousCheckedAt: previous.checkedAt,
    currentCheckedAt: current.checkedAt,
    summary: summarizeChanges(items),
    items
  };
}

export function appendGscHistory(history, snapshot, { limit = DEFAULT_HISTORY_LIMIT } = {}) {
  assertSnapshot(snapshot, snapshot.siteUrl);
  const safeSnapshot = sanitizeStoredSnapshot(snapshot);
  const safeLimit = normalizeHistoryLimit(limit);
  const existing = normalizeHistory(history);
  if (existing.siteUrl && existing.siteUrl !== safeSnapshot.siteUrl) {
    throw historyError("gsc_history_site_mismatch", "The history file belongs to a different Search Console property.");
  }
  const entries = existing.entries.filter((item) => item.checkedAt !== safeSnapshot.checkedAt);
  entries.push(safeSnapshot);
  return {
    schema: HISTORY_SCHEMA,
    siteUrl: safeSnapshot.siteUrl,
    updatedAt: safeSnapshot.checkedAt,
    entries: entries.slice(-safeLimit)
  };
}

export async function loadGscHistory(filePath, options = {}) {
  const resolved = resolveGscHistoryPath(filePath, options);
  try {
    const bytes = await readFile(resolved);
    if (bytes.byteLength > MAX_HISTORY_BYTES) {
      throw historyError("gsc_history_too_large", "The GSC history file exceeds the 2 MiB safety limit.");
    }
    return normalizeHistory(JSON.parse(bytes.toString("utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return normalizeHistory();
    if (String(error?.code || "").startsWith("gsc_")) throw error;
    throw historyError("gsc_history_invalid", "The GSC history file could not be read as valid JSON.");
  }
}

export async function saveGscHistory(filePath, history, options = {}) {
  const resolved = resolveGscHistoryPath(filePath, options);
  const safeHistory = normalizeHistory(history);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  try {
    const content = `${JSON.stringify(safeHistory, null, 2)}\n`;
    if (Buffer.byteLength(content, "utf8") > MAX_HISTORY_BYTES) {
      throw historyError("gsc_history_too_large", "The GSC history file exceeds the 2 MiB safety limit.");
    }
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, resolved);
    await chmod(resolved, 0o600).catch(() => {});
    return resolved;
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (String(error?.code || "").startsWith("gsc_")) throw error;
    throw historyError("gsc_history_write_failed", "The GSC history file could not be saved.");
  }
}

export function resolveGscHistoryPath(filePath, { cwd = process.cwd() } = {}) {
  if (!filePath) throw historyError("gsc_history_path_required", "A GSC history file path is required.");
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, filePath);
  const relative = path.relative(root, resolved);
  const insideRoot = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  if (insideRoot) {
    const privateRoot = path.resolve(root, "runtime", "private");
    const privateRelative = path.relative(privateRoot, resolved);
    const insidePrivate = privateRelative === "" || (!privateRelative.startsWith(`..${path.sep}`) && privateRelative !== ".." && !path.isAbsolute(privateRelative));
    if (!insidePrivate) {
      throw historyError("gsc_history_path_unsafe", "GSC history inside the repository must stay under runtime/private/.");
    }
  }
  return resolved;
}

export function latestGscSnapshot(history) {
  const normalized = normalizeHistory(history);
  return normalized.entries.at(-1) || null;
}

function normalizeHistory(value = {}) {
  if (value?.schema && value.schema !== HISTORY_SCHEMA) {
    throw historyError("gsc_history_schema_unsupported", "The GSC history schema is not supported.");
  }
  const entries = Array.isArray(value?.entries) ? value.entries : [];
  const normalizedEntries = entries.map((item) => {
    assertSnapshot(item, String(value.siteUrl || item?.siteUrl || ""));
    return sanitizeStoredSnapshot(item);
  });
  return {
    schema: HISTORY_SCHEMA,
    siteUrl: String(value?.siteUrl || normalizedEntries[0]?.siteUrl || ""),
    updatedAt: String(value?.updatedAt || normalizedEntries.at(-1)?.checkedAt || ""),
    entries: normalizedEntries.slice(-MAX_HISTORY_LIMIT)
  };
}

function assertSnapshot(value, expectedSiteUrl) {
  if (!value || value.schema !== HISTORY_SCHEMA || typeof value.checkedAt !== "string" || !Array.isArray(value.urls) || !Array.isArray(value.issues)) {
    throw historyError("gsc_history_snapshot_invalid", "The GSC history contains an invalid snapshot.");
  }
  if (!value.siteUrl || (expectedSiteUrl && value.siteUrl !== expectedSiteUrl)) {
    throw historyError("gsc_history_site_mismatch", "The GSC history contains a different Search Console property.");
  }
}

function sanitizeCounts(value = {}) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, count]) => /^[a-z0-9_]+$/.test(key) && Number.isFinite(Number(count)))
      .map(([key, count]) => [key, Number(count)])
  );
}

function sanitizeIssues(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => ({
    code: safeIdentifier(item?.code, "unknown_issue"),
    severity: ["error", "warning", "info"].includes(item?.severity) ? item.severity : "error",
    url: safeHistoryUrl(item?.url),
    capability: safeIdentifier(item?.capability, "")
  }));
}

function sanitizeStoredSnapshot(item) {
  return {
    schema: HISTORY_SCHEMA,
    checkedAt: String(item.checkedAt || ""),
    siteUrl: String(item.siteUrl || ""),
    summary: { counts: sanitizeCounts(item.summary?.counts) },
    urls: item.urls.map((value) => ({
      url: safeHistoryUrl(value?.url),
      status: safeIdentifier(value?.status, "ready_for_google"),
      publicReady: value?.publicReady === true,
      httpStatus: Number(value?.httpStatus) || 0,
      robotsAllowed: value?.robotsAllowed === true,
      sitemapIncluded: value?.sitemapIncluded === true,
      canonicalMatches: value?.canonicalMatches === true,
      noindex: value?.noindex === true,
      lastCrawlTime: String(value?.lastCrawlTime || "").slice(0, 40)
    })).filter((value) => value.url),
    issues: sanitizeIssues(item.issues)
  };
}

function safeIdentifier(value, fallback) {
  const text = String(value || "");
  return /^[a-z0-9_.-]{1,80}$/i.test(text) ? text : fallback;
}

function safeHistoryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if ([...url.searchParams.keys()].some((key) => /(api[_-]?key|auth|credential|password|secret|session|token)/i.test(key))) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function issueKey(item) {
  return [item.code, item.severity, item.url, item.capability].join("|");
}

function statusDirection(fromStatus, toStatus) {
  if (PROBLEM_STATUSES.has(fromStatus) && !PROBLEM_STATUSES.has(toStatus)) return "improved";
  if (!PROBLEM_STATUSES.has(fromStatus) && PROBLEM_STATUSES.has(toStatus)) return "regressed";
  if (toStatus === "indexed" && fromStatus !== "indexed") return "improved";
  if (fromStatus === "indexed" && toStatus !== "indexed") return "regressed";
  return "changed";
}

function summarizeChanges(items) {
  const summary = emptyChangeCounts();
  summary.total = items.length;
  for (const item of items) {
    if (item.direction === "improved") summary.improved += 1;
    if (item.direction === "regressed") summary.regressed += 1;
    if (item.type === "status_changed" || item.type === "public_readiness_changed") summary.changed += 1;
    if (item.type === "url_added") summary.added += 1;
    if (item.type === "url_removed") summary.removed += 1;
    if (item.type === "issue_added") summary.issuesAdded += 1;
    if (item.type === "issue_resolved") summary.issuesResolved += 1;
  }
  return summary;
}

function emptyChangeCounts() {
  return {
    total: 0,
    improved: 0,
    regressed: 0,
    changed: 0,
    added: 0,
    removed: 0,
    issuesAdded: 0,
    issuesResolved: 0
  };
}

function normalizeHistoryLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 2 || limit > MAX_HISTORY_LIMIT) {
    throw historyError("gsc_history_limit_invalid", `GSC history limit must be an integer between 2 and ${MAX_HISTORY_LIMIT}.`);
  }
  return limit;
}

function historyError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.platform = "google_search_console";
  error.retryable = false;
  return error;
}
