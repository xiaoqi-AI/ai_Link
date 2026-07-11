import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const SENSITIVE_QUERY_KEY = /(api[_-]?key|auth|credential|password|secret|session|token)/i;
const DEFAULT_ALERT_STATUSES = new Set([
  "blocked_by_robots",
  "sitemap_error",
  "manual_action_required"
]);

export const GSC_URL_STATUSES = Object.freeze([
  "ready_for_google",
  "indexing_requested_by_user",
  "indexed",
  "discovered_not_indexed",
  "crawled_not_indexed",
  "blocked_by_robots",
  "sitemap_error",
  "manual_action_required",
  "quota_wait"
]);

export class MockGoogleSearchConsoleApiClient {
  constructor({ sites = [], inspections = {}, sitemaps = [] } = {}) {
    this.mode = "mock";
    this.sites = sites;
    this.inspections = inspections;
    this.sitemaps = sitemaps;
  }

  async listSites() {
    return { siteEntry: this.sites };
  }

  async inspectUrl({ inspectionUrl }) {
    const configured = this.inspections[inspectionUrl];
    if (configured?.inspectionResult) return configured;
    return {
      inspectionResult: configured || {
        indexStatusResult: {
          verdict: "NEUTRAL",
          coverageState: "URL is unknown to Google",
          robotsTxtState: "ROBOTS_TXT_STATE_UNSPECIFIED",
          indexingState: "INDEXING_STATE_UNSPECIFIED",
          pageFetchState: "PAGE_FETCH_STATE_UNSPECIFIED",
          userCanonical: inspectionUrl
        }
      }
    };
  }

  async listSitemaps({ siteUrl }) {
    return {
      sitemap: this.sitemaps.filter((item) => !item.siteUrl || item.siteUrl === siteUrl)
    };
  }

  async submitSitemap({ siteUrl, feedpath }) {
    return { siteUrl, feedpath, submitted: true, mode: "mock" };
  }
}

export class GoogleSearchConsoleConnector {
  constructor({
    apiClient = new MockGoogleSearchConsoleApiClient(),
    fetchImpl = globalThis.fetch,
    resolveHost = defaultResolveHost,
    clock = () => new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw connectorError("fetch_unavailable", "A fetch implementation is required.");
    }
    this.apiClient = apiClient;
    this.fetchImpl = fetchImpl;
    this.resolveHost = resolveHost;
    this.clock = clock;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.status = "available";
    this.mode = apiClient.mode === "mock" ? "public-check+mock-google-api" : "private-api-client+public-check";
    this.capabilityModes = Object.freeze({
      list_sites: apiClient.mode === "mock" ? "mock" : "live-read-only",
      inspect_url: apiClient.mode === "mock" ? "mock" : "live-read-only",
      list_sitemaps: apiClient.mode === "mock" ? "mock" : "live-read-only",
      submit_sitemap: apiClient.mode === "mock"
        ? "approval-required-mock"
        : apiClient.mode === "live-read-only"
          ? "approval-and-write-scope-required"
          : "approval-required",
      check_public_crawlability: "live-read-only",
      generate_status_report: "local"
    });
    this.hostCache = new Map();
  }

  async listSites() {
    const response = await this.apiClient.listSites();
    return {
      mode: this.capabilityModes.list_sites,
      sites: (response?.siteEntry || response?.sites || []).map(sanitizeSite)
    };
  }

  async inspectUrl({ inspectionUrl, siteUrl, languageCode = "zh-CN" }) {
    if (!inspectionUrl || !siteUrl) {
      throw connectorError("invalid_gsc_input", "inspectionUrl and siteUrl are required.");
    }
    const response = await this.apiClient.inspectUrl({ inspectionUrl, siteUrl, languageCode });
    return sanitizeInspection(inspectionUrl, response, this.capabilityModes.inspect_url);
  }

  async listSitemaps({ siteUrl }) {
    if (!siteUrl) throw connectorError("invalid_gsc_input", "siteUrl is required.");
    const response = await this.apiClient.listSitemaps({ siteUrl });
    return {
      mode: this.capabilityModes.list_sitemaps,
      sitemaps: (response?.sitemap || response?.sitemaps || []).map(sanitizeGscSitemap)
    };
  }

  async submitSitemap({ siteUrl, feedpath, approved = false }) {
    if (!siteUrl || !feedpath) {
      throw connectorError("invalid_gsc_input", "siteUrl and feedpath are required.");
    }
    if (!approved) {
      return {
        status: "manual_action_required",
        platform: "google_search_console",
        action: "approve_sitemap_submit",
        siteUrl,
        feedpath,
        approval: {
          required: true,
          reason: "Submitting a sitemap changes external Search Console state."
        }
      };
    }
    const response = await this.apiClient.submitSitemap({ siteUrl, feedpath });
    return {
      status: this.apiClient.mode === "mock" ? "submitted_mock" : "submitted",
      platform: "google_search_console",
      siteUrl,
      feedpath,
      mode: this.capabilityModes.submit_sitemap,
      response: sanitizeSubmitResponse(response)
    };
  }

  async checkPublicCrawlability(input) {
    const config = normalizeMonitorConfig(input);
    const robots = await this.#checkRobots(config);
    const sitemapInternal = await Promise.all(
      config.sitemaps.map((sitemapUrl) => this.#checkSitemap(sitemapUrl, config))
    );
    const sitemapUrls = new Set();
    for (const sitemap of sitemapInternal) {
      for (const url of sitemap.discoveredUrls) sitemapUrls.add(url);
    }

    const urls = await Promise.all(config.urls.map(async (url) => {
      const page = await this.#checkPage(url, config);
      const issues = [...page.issues];
      if (!robots.allowedByUrl[url]) {
        issues.push(issue("blocked_by_robots", "robots.txt blocks this URL for Googlebot."));
      }
      if (!robots.declaresConfiguredSitemap) {
        issues.push(issue("robots_sitemap_not_declared", "robots.txt does not declare a configured sitemap."));
      }
      if (!sitemapUrls.has(url)) {
        issues.push(issue("sitemap_missing_url", "No configured sitemap contains this canonical URL."));
      }

      const legacyChecks = await Promise.all(
        config.legacyUrls
          .filter((item) => item.target === url)
          .map((item) => this.#checkLegacyRedirect(item, config))
      );
      if (legacyChecks.some((item) => !item.ok)) {
        issues.push(issue("legacy_redirect_invalid", "A legacy URL does not redirect to the canonical URL with 301 or 308."));
      }

      return {
        url,
        finalUrl: page.finalUrl,
        httpStatus: page.httpStatus,
        httpOk: page.httpStatus === 200,
        canonical: page.canonical,
        canonicalMatches: page.canonical === url,
        noindex: page.noindex,
        robotsAllowed: robots.allowedByUrl[url],
        sitemapIncluded: sitemapUrls.has(url),
        legacyRedirects: legacyChecks,
        publicReady: issues.length === 0,
        issues
      };
    }));

    return {
      checkedAt: this.clock().toISOString(),
      siteUrl: config.siteUrl,
      publicBaseUrl: config.publicBaseUrl,
      robots,
      sitemaps: sitemapInternal.map(({ discoveredUrls, ...sitemap }) => ({
        ...sitemap,
        urlCount: discoveredUrls.size,
        containsUrls: config.urls.filter((url) => discoveredUrls.has(url)),
        legacyUrlsFound: config.legacyUrls
          .map((item) => item.source)
          .filter((url) => discoveredUrls.has(url))
      })),
      urls
    };
  }

  async monitorSite(input) {
    const config = normalizeMonitorConfig(input);
    const publicCheck = await this.checkPublicCrawlability(config);
    const apiErrors = [];
    const [sites, apiSitemaps] = await Promise.all([
      this.listSites().catch((error) => {
        apiErrors.push(safeApiError("list_sites", error));
        return { mode: this.capabilityModes.list_sites, sites: [] };
      }),
      this.listSitemaps({ siteUrl: config.siteUrl }).catch((error) => {
        apiErrors.push(safeApiError("list_sitemaps", error));
        return { mode: this.capabilityModes.list_sitemaps, sitemaps: [] };
      })
    ]);

    const inspectionByUrl = new Map();
    await Promise.all(config.urls.map(async (url) => {
      try {
        inspectionByUrl.set(url, await this.inspectUrl({
          inspectionUrl: url,
          siteUrl: config.siteUrl,
          languageCode: config.languageCode
        }));
      } catch (error) {
        apiErrors.push(safeApiError("inspect_url", error, url));
      }
    }));

    const urls = publicCheck.urls.map((item) => {
      const inspection = inspectionByUrl.get(item.url) || null;
      const operatorState = config.operatorStates[item.url] || "";
      return {
        ...item,
        inspection,
        status: classifyUrlStatus({ publicCheck: item, inspection, operatorState })
      };
    });

    const googleApiIssues = [];
    if (this.apiClient.mode !== "mock" && !sites.sites.some((item) => item.siteUrl === config.siteUrl)) {
      googleApiIssues.push(issue("gsc_property_not_listed", "The configured Search Console property is not available to the authorized account.", "error"));
    }
    for (const sitemap of apiSitemaps.sitemaps) {
      if (sitemap.errors > 0) {
        googleApiIssues.push(issue("gsc_sitemap_error", `${sitemap.path || "A Search Console sitemap"} reports ${sitemap.errors} error(s).`, "error"));
      } else if (sitemap.warnings > 0) {
        googleApiIssues.push(issue("gsc_sitemap_warning", `${sitemap.path || "A Search Console sitemap"} reports ${sitemap.warnings} warning(s).`, "warning"));
      }
    }
    const globalIssues = [
      ...publicCheck.robots.issues,
      ...publicCheck.sitemaps.flatMap((item) => item.issues.map((entry) => ({ ...entry, url: item.url }))),
      ...apiErrors,
      ...googleApiIssues
    ];
    const alertStatuses = new Set(config.alertPolicy.statuses || [...DEFAULT_ALERT_STATUSES]);
    const alerts = urls
      .filter((item) => alertStatuses.has(item.status))
      .map((item) => ({ url: item.url, status: item.status, issues: item.issues }));
    if (globalIssues.some((entry) => entry.severity === "error")) {
      alerts.push({ url: config.publicBaseUrl, status: "manual_action_required", issues: globalIssues });
    }

    const counts = Object.fromEntries(GSC_URL_STATUSES.map((status) => [status, 0]));
    for (const item of urls) counts[item.status] += 1;
    const nextCheckAt = calculateNextCheckAt(this.clock(), config.schedule);
    const conclusion = buildConclusion({
      urls,
      globalIssues,
      googleApiMode: this.apiClient.mode === "mock" ? "mock" : "private-client"
    });
    const result = {
      platform: "google_search_console",
      mode: this.mode,
      checkedAt: publicCheck.checkedAt,
      nextCheckAt,
      siteUrl: config.siteUrl,
      publicBaseUrl: config.publicBaseUrl,
      summary: {
        conclusion,
        totalUrls: urls.length,
        publicReady: urls.filter((item) => item.publicReady).length,
        requiresManualAction: alerts.length > 0,
        counts
      },
      googleApi: {
        mode: this.apiClient.mode === "mock" ? "mock" : "private-client",
        sites: sites.sites.filter((item) => item.siteUrl === config.siteUrl),
        sitemaps: apiSitemaps.sitemaps,
        errors: apiErrors
      },
      publicCheck: {
        robots: publicCheck.robots,
        sitemaps: publicCheck.sitemaps
      },
      urls,
      alerts,
      globalIssues
    };
    return {
      ...result,
      reportMarkdown: this.generateStatusReport(result)
    };
  }

  generateStatusReport(result) {
    const recovered = result.urls.filter((item) => item.publicReady);
    const waiting = result.urls.filter((item) => [
      "ready_for_google",
      "indexing_requested_by_user",
      "discovered_not_indexed",
      "crawled_not_indexed",
      "quota_wait"
    ].includes(item.status));
    const manual = result.alerts;
    const lines = [
      "# GSC 自动检查报告",
      "",
      `检查时间：${result.checkedAt}`,
      `结论：${result.summary.conclusion}`,
      "",
      "## 今日变化",
      "",
      "- 当前为单次快照；接入历史记录后才能计算日级变化。",
      "",
      "## 已恢复项",
      ""
    ];
    lines.push(...renderUrlItems(recovered, "暂无全部通过公开抓取检查的 URL。", (item) => `${item.url}：HTTP 200、robots、sitemap、canonical 与 noindex 检查通过。`));
    lines.push("", "## 仍待 Google 刷新的项", "");
    lines.push(...renderUrlItems(waiting, "暂无等待 Google 刷新的 URL。", (item) => `${item.url}：${statusLabel(item.status)}。`));
    lines.push("", "## 需要人工操作的项", "");
    lines.push(...renderUrlItems(manual, "当前没有必须人工处理的技术异常。", (item) => {
      const details = (item.issues || []).map((entry) => entry.message).filter(Boolean).join("；");
      return `${item.url}：${statusLabel(item.status)}${details ? `；${details}` : ""}。`;
    }));
    lines.push("", "## 风险", "");
    if (result.googleApi.mode === "mock") {
      lines.push("- Google Search Console 官方 API 当前为 mock；索引状态需在私有 OAuth 适配器接入后复核。");
    }
    lines.push("- URL Inspection API 只能返回 Google 索引中的版本，不能替代 GSC 页面内的 Live Test。", "- Request indexing 仍是人工操作，并受 Google 配额控制。", "", `下一次检查时间：${result.nextCheckAt}`);
    return `${lines.join("\n")}\n`;
  }

  async #checkRobots(config) {
    const robotsUrl = new URL("/robots.txt", config.publicBaseUrl).toString();
    const issues = [];
    let response;
    try {
      response = await this.#fetch(robotsUrl, config.origin);
    } catch (error) {
      return {
        url: robotsUrl,
        httpStatus: 0,
        reachable: false,
        declaredSitemaps: [],
        declaresConfiguredSitemap: false,
        allowedByUrl: Object.fromEntries(config.urls.map((url) => [url, false])),
        issues: [issue("robots_fetch_failed", safeErrorMessage(error), "error")]
      };
    }
    if (response.status !== 200) {
      return {
        url: robotsUrl,
        httpStatus: response.status,
        reachable: false,
        declaredSitemaps: [],
        declaresConfiguredSitemap: false,
        allowedByUrl: Object.fromEntries(config.urls.map((url) => [url, response.status === 404])),
        issues: [issue("robots_http_error", `robots.txt returned HTTP ${response.status}.`, "error")]
      };
    }
    const text = await readTextLimited(response, this.maxBytes);
    const parsed = parseRobots(text);
    const declaredSitemaps = parsed.sitemaps.map((value) => normalizeComparableUrl(value)).filter(Boolean);
    const declaresConfiguredSitemap = config.sitemaps.some((url) => declaredSitemaps.includes(url));
    if (!declaresConfiguredSitemap) {
      issues.push(issue("robots_sitemap_not_declared", "robots.txt does not declare a configured sitemap.", "warning"));
    }
    return {
      url: robotsUrl,
      httpStatus: response.status,
      reachable: true,
      declaredSitemaps,
      declaresConfiguredSitemap,
      allowedByUrl: Object.fromEntries(config.urls.map((url) => {
        const parsedUrl = new URL(url);
        return [url, robotsAllows(parsed.groups, `${parsedUrl.pathname}${parsedUrl.search}`)];
      })),
      issues
    };
  }

  async #checkSitemap(sitemapUrl, config) {
    const discoveredUrls = new Set();
    const documents = [];
    const issues = [];
    const visited = new Set();

    const visit = async (url, depth) => {
      if (visited.has(url) || visited.size >= 25) return;
      visited.add(url);
      let response;
      try {
        response = await this.#fetch(url, config.origin);
      } catch (error) {
        issues.push(issue("sitemap_fetch_failed", safeErrorMessage(error), "error"));
        return;
      }
      documents.push({ url, httpStatus: response.status });
      if (response.status !== 200) {
        issues.push(issue("sitemap_http_error", `${url} returned HTTP ${response.status}.`, "error"));
        return;
      }
      const text = await readTextLimited(response, this.maxBytes);
      const locations = extractSitemapLocations(text);
      if (locations.length === 0 && !/<(?:urlset|sitemapindex)\b/i.test(text)) {
        issues.push(issue("sitemap_parse_error", `${url} is not a recognized sitemap XML document.`, "error"));
        return;
      }
      if (/<sitemapindex\b/i.test(text) && depth < 2) {
        for (const child of locations.slice(0, 20)) {
          const normalized = normalizeComparableUrl(child);
          if (normalized && new URL(normalized).origin === config.origin) await visit(normalized, depth + 1);
        }
        return;
      }
      for (const location of locations) {
        const normalized = normalizeComparableUrl(location);
        if (normalized) discoveredUrls.add(normalized);
      }
    };

    await visit(sitemapUrl, 0);
    return {
      url: sitemapUrl,
      readable: issues.every((entry) => entry.severity !== "error"),
      documents,
      issues,
      discoveredUrls
    };
  }

  async #checkPage(url, config) {
    try {
      const response = await this.#fetch(url, config.origin);
      const finalUrl = normalizeComparableUrl(response.url || url);
      if (response.status !== 200) {
        return {
          finalUrl,
          httpStatus: response.status,
          canonical: "",
          noindex: false,
          issues: [issue("http_status_not_200", `${url} returned HTTP ${response.status}.`)]
        };
      }
      const html = await readTextLimited(response, this.maxBytes);
      const canonical = extractCanonical(html, finalUrl);
      const noindex = extractNoindex(html, response.headers.get("x-robots-tag") || "");
      const issues = [];
      if (finalUrl !== url) issues.push(issue("unexpected_redirect_target", `Final URL is ${finalUrl}.`));
      if (!canonical) issues.push(issue("canonical_missing", "No canonical link was found."));
      if (canonical && canonical !== url) issues.push(issue("canonical_mismatch", `Canonical points to ${canonical}.`));
      if (noindex) issues.push(issue("noindex_detected", "Page contains a noindex directive."));
      return { finalUrl, httpStatus: response.status, canonical, noindex, issues };
    } catch (error) {
      return {
        finalUrl: "",
        httpStatus: 0,
        canonical: "",
        noindex: false,
        issues: [issue("page_fetch_failed", safeErrorMessage(error))]
      };
    }
  }

  async #checkLegacyRedirect({ source, target }, config) {
    try {
      const response = await this.#fetch(source, config.origin, "manual");
      const location = response.headers.get("location") || "";
      const resolved = location ? normalizeComparableUrl(new URL(location, source).toString()) : "";
      return {
        source,
        target,
        httpStatus: response.status,
        location: resolved,
        ok: [301, 308].includes(response.status) && resolved === target
      };
    } catch (error) {
      return { source, target, httpStatus: 0, location: "", ok: false, error: safeErrorMessage(error) };
    }
  }

  async #fetch(url, origin, redirect = "follow") {
    let currentUrl = await this.#assertSafeUrl(url, origin);
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      const response = await this.fetchImpl(currentUrl, {
        redirect: "manual",
        headers: {
          accept: "text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1",
          "user-agent": "ai-link-gsc-public-check/0.1"
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (redirect !== "follow" || ![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = await this.#assertSafeUrl(new URL(location, currentUrl).toString(), origin);
    }
    throw connectorError("too_many_redirects", `More than five redirects while fetching ${url}.`);
  }

  async #assertSafeUrl(value, origin) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw connectorError("invalid_public_url", `Invalid URL: ${value}`);
    }
    if (url.protocol !== "https:") {
      throw connectorError("unsafe_public_url", `Only HTTPS public URLs are allowed: ${url.toString()}`);
    }
    if (url.username || url.password || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))) {
      throw connectorError("sensitive_public_url", "URLs with embedded credentials or sensitive query parameter names are not allowed.");
    }
    if (origin && url.origin !== origin) {
      throw connectorError("cross_origin_url", `URL must stay on ${origin}: ${url.toString()}`);
    }
    if (isPrivateHostname(url.hostname)) {
      throw connectorError("private_network_blocked", `Private or local hosts are not allowed: ${url.hostname}`);
    }
    if (!this.hostCache.has(url.hostname)) {
      const addresses = await this.resolveHost(url.hostname);
      if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address || item))) {
        throw connectorError("private_network_blocked", `Host did not resolve exclusively to public addresses: ${url.hostname}`);
      }
      this.hostCache.set(url.hostname, true);
    }
    return normalizeComparableUrl(url.toString());
  }
}

async function defaultResolveHost(hostname) {
  if (isIP(hostname)) return [{ address: hostname }];
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function normalizeMonitorConfig(input = {}) {
  const siteUrl = String(input.siteUrl || "").trim();
  if (!siteUrl) throw connectorError("invalid_gsc_input", "siteUrl is required.");
  const publicBaseValue = siteUrl.startsWith("sc-domain:") ? input.publicBaseUrl : (input.publicBaseUrl || siteUrl);
  if (!publicBaseValue) {
    throw connectorError("public_base_url_required", "publicBaseUrl is required for a domain property.");
  }
  const publicBaseUrl = normalizeComparableUrl(publicBaseValue);
  if (!publicBaseUrl) throw connectorError("invalid_gsc_input", "publicBaseUrl must be an absolute HTTPS URL.");
  const origin = new URL(publicBaseUrl).origin;
  const urls = uniqueUrls(input.urls, origin, "urls");
  const sitemaps = uniqueUrls(input.sitemaps, origin, "sitemaps");
  if (urls.length === 0) throw connectorError("invalid_gsc_input", "At least one canonical URL is required.");
  if (sitemaps.length === 0) throw connectorError("invalid_gsc_input", "At least one sitemap URL is required.");
  return {
    ...input,
    siteUrl,
    publicBaseUrl,
    origin,
    urls,
    sitemaps,
    legacyUrls: normalizeLegacyUrls(input.legacyUrls, origin),
    schedule: input.schedule || "daily",
    languageCode: input.languageCode || "en-US",
    operatorStates: input.operatorStates || {},
    alertPolicy: input.alertPolicy || {}
  };
}

function uniqueUrls(values, origin, field) {
  if (!Array.isArray(values)) return [];
  const limit = field === "sitemaps" ? 10 : 50;
  if (values.length > limit) throw connectorError("invalid_gsc_input", `${field} supports at most ${limit} entries per check.`);
  const urls = values.map((value) => normalizeComparableUrl(value));
  if (urls.some((value) => !value)) throw connectorError("invalid_gsc_input", `${field} contains an invalid URL.`);
  if (urls.some((value) => new URL(value).protocol !== "https:" || new URL(value).origin !== origin)) {
    throw connectorError("invalid_gsc_input", `${field} must contain same-origin HTTPS URLs.`);
  }
  return [...new Set(urls)];
}

function normalizeLegacyUrls(value, origin) {
  const entries = Array.isArray(value)
    ? value.map((item) => [item.source, item.target])
    : Object.entries(value || {});
  if (entries.length > 50) throw connectorError("invalid_gsc_input", "legacyUrls supports at most 50 entries per check.");
  return entries.map(([sourceValue, targetValue]) => {
    const source = normalizeComparableUrl(sourceValue);
    const target = normalizeComparableUrl(targetValue);
    if (!source || !target || new URL(source).origin !== origin || new URL(target).origin !== origin) {
      throw connectorError("invalid_gsc_input", "legacyUrls must map same-origin HTTPS source URLs to canonical targets.");
    }
    return { source, target };
  });
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function classifyUrlStatus({ publicCheck, inspection, operatorState }) {
  const coverage = String(inspection?.coverageState || "").toLowerCase();
  const robotsState = String(inspection?.robotsTxtState || "").toLowerCase();
  const pageFetchState = String(inspection?.pageFetchState || "").toLowerCase();
  if (!publicCheck.robotsAllowed || coverage.includes("blocked by robots") || coverage.includes("robots.txt 阻") || robotsState.includes("blocked") || robotsState.includes("disallowed") || pageFetchState.includes("blocked by robots")) {
    return "blocked_by_robots";
  }
  if (!publicCheck.sitemapIncluded || publicCheck.issues.some((item) => item.code.startsWith("sitemap_"))) {
    return "sitemap_error";
  }
  if (!publicCheck.publicReady) return "manual_action_required";
  if (["indexing_requested_by_user", "quota_wait"].includes(operatorState)) return operatorState;
  if ((coverage.includes("indexed") && !coverage.includes("not indexed")) || (coverage.includes("已编入索引") && !coverage.includes("未编入索引"))) return "indexed";
  if ((coverage.includes("discovered") && coverage.includes("not indexed")) || (coverage.includes("已发现") && coverage.includes("未编入索引"))) return "discovered_not_indexed";
  if ((coverage.includes("crawled") && coverage.includes("not indexed")) || (coverage.includes("已抓取") && coverage.includes("未编入索引"))) return "crawled_not_indexed";
  return "ready_for_google";
}

function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let agents = [];
  let rules = [];
  const flush = () => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (rules.length > 0) flush();
      agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && agents.length > 0) {
      if (value || key === "allow") rules.push({ type: key, value });
    } else if (key === "sitemap" && value) {
      sitemaps.push(value);
    }
  }
  flush();
  return { groups, sitemaps };
}

function robotsAllows(groups, pathValue) {
  const googleGroups = groups.filter((group) => group.agents.includes("googlebot"));
  const selected = googleGroups.length > 0 ? googleGroups : groups.filter((group) => group.agents.includes("*"));
  const matches = selected
    .flatMap((group) => group.rules)
    .filter((rule) => rule.value && robotsRuleMatches(rule.value, pathValue))
    .sort((a, b) => b.value.length - a.value.length || (a.type === "allow" ? -1 : 1));
  return matches.length === 0 || matches[0].type === "allow";
}

function robotsRuleMatches(rule, pathValue) {
  const endAnchored = rule.endsWith("$");
  const body = endAnchored ? rule.slice(0, -1) : rule;
  const pattern = body.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${pattern}${endAnchored ? "$" : ""}`).test(pathValue);
}

function extractSitemapLocations(xml) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
}

function extractCanonical(html, baseUrl) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const rel = String(attrs.rel || "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical") && attrs.href) {
      return normalizeComparableUrl(new URL(attrs.href, baseUrl).toString());
    }
  }
  return "";
}

function extractNoindex(html, headerValue) {
  if (String(headerValue).toLowerCase().split(/[,;]/).some((part) => part.trim() === "noindex")) return true;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const name = String(attrs.name || "").toLowerCase();
    if (["robots", "googlebot"].includes(name) && /(?:^|[,\s])noindex(?:$|[,\s])/i.test(String(attrs.content || ""))) {
      return true;
    }
  }
  return false;
}

function parseAttributes(tag) {
  const attrs = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    const key = match[1].toLowerCase();
    if (!key.startsWith("<")) attrs[key] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

async function readTextLimited(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw connectorError("response_too_large", `Response exceeds ${maxBytes} bytes.`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw connectorError("response_too_large", `Response exceeds ${maxBytes} bytes.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isPrivateHostname(hostname) {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal") || (isIP(hostname) > 0 && isPrivateAddress(hostname));
}

function isPrivateAddress(address) {
  const value = String(address).toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  if (value.includes(":")) {
    return value === "::1" || value === "0:0:0:0:0:0:0:1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
  }
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function sanitizeSite(value = {}) {
  return {
    siteUrl: String(value.siteUrl || value.site_url || ""),
    permissionLevel: String(value.permissionLevel || value.permission_level || "")
  };
}

function sanitizeInspection(inspectionUrl, response = {}, mode) {
  const result = response.inspectionResult || response;
  const index = result.indexStatusResult || {};
  return {
    inspectionUrl,
    mode,
    verdict: String(index.verdict || ""),
    coverageState: String(index.coverageState || ""),
    robotsTxtState: String(index.robotsTxtState || ""),
    indexingState: String(index.indexingState || ""),
    pageFetchState: String(index.pageFetchState || ""),
    lastCrawlTime: String(index.lastCrawlTime || ""),
    googleCanonical: String(index.googleCanonical || ""),
    userCanonical: String(index.userCanonical || ""),
    sitemap: Array.isArray(index.sitemap) ? index.sitemap.map(String) : []
  };
}

function sanitizeGscSitemap(value = {}) {
  return {
    path: String(value.path || ""),
    lastSubmitted: String(value.lastSubmitted || ""),
    lastDownloaded: String(value.lastDownloaded || ""),
    isPending: Boolean(value.isPending),
    isSitemapsIndex: Boolean(value.isSitemapsIndex),
    type: String(value.type || ""),
    warnings: Number(value.warnings || 0),
    errors: Number(value.errors || 0)
  };
}

function sanitizeSubmitResponse(value = {}) {
  return {
    submitted: Boolean(value.submitted),
    mode: String(value.mode || "")
  };
}

function buildConclusion({ urls, globalIssues, googleApiMode }) {
  if (urls.some((item) => ["blocked_by_robots", "sitemap_error", "manual_action_required"].includes(item.status)) || globalIssues.some((item) => item.severity === "error")) {
    return "检测到影响抓取或索引判断的技术异常，需要人工处理。";
  }
  if (urls.every((item) => item.status === "indexed")) return "所有重点 URL 均显示已索引。";
  if (googleApiMode === "mock") return "站点技术抓取条件正常；Google Index 状态待私有 API 或 GSC 人工复核。";
  return "站点技术抓取条件正常，Google Index 仍在刷新。";
}

function calculateNextCheckAt(now, schedule) {
  const date = new Date(now);
  const hours = Number.isFinite(Number(schedule)) ? Number(schedule) : 24;
  date.setTime(date.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  return date.toISOString();
}

function renderUrlItems(items, emptyText, formatter) {
  return items.length > 0 ? items.map((item) => `- ${formatter(item)}`) : [`- ${emptyText}`];
}

function statusLabel(status) {
  return ({
    ready_for_google: "技术条件正常，等待 Google",
    indexing_requested_by_user: "用户已手动提交索引请求",
    indexed: "已索引",
    discovered_not_indexed: "Google 已发现但尚未索引",
    crawled_not_indexed: "Google 已抓取但尚未索引",
    blocked_by_robots: "robots.txt 阻挡",
    sitemap_error: "sitemap 异常",
    manual_action_required: "需要人工处理",
    quota_wait: "人工请求配额已用尽，等待下一日"
  })[status] || status;
}

function safeApiError(capability, error, url = "") {
  const code = String(error?.code || "google_api_unavailable");
  return {
    code,
    capability,
    url,
    message: `Google Search Console capability ${capability} failed (${code}).`,
    severity: "error"
  };
}

function issue(code, message, severity = "error") {
  return { code, message, severity };
}

function connectorError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.platform = "google_search_console";
  error.retryable = false;
  return error;
}

function safeErrorMessage(error) {
  return String(error?.message || "Connector request failed.")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|authorization|credential|password|secret|session|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-secret]")
    .slice(0, 240);
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
