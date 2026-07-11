const DEFAULT_API_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TOKEN_REFRESH_SKEW_MS = 60_000;

export const GOOGLE_WEBMASTERS_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GOOGLE_WEBMASTERS_WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class AuthorizedUserTokenProvider {
  constructor({
    credentials,
    fetchImpl = globalThis.fetch,
    clock = () => Date.now(),
    timeoutMs = DEFAULT_API_TIMEOUT_MS
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw gscApiError("gsc_fetch_unavailable", "A fetch implementation is required.");
    }
    this.credentials = normalizeAuthorizedUserCredentials(credentials);
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.timeoutMs = timeoutMs;
    this.cachedToken = "";
    this.cachedTokenExpiresAt = 0;
  }

  async getAccessToken() {
    const now = Number(this.clock());
    if (this.cachedToken && now + TOKEN_REFRESH_SKEW_MS < this.cachedTokenExpiresAt) {
      return this.cachedToken;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body = new URLSearchParams({
        client_id: this.credentials.client_id,
        refresh_token: this.credentials.refresh_token,
        grant_type: "refresh_token"
      });
      if (this.credentials.client_secret) body.set("client_secret", this.credentials.client_secret);

      const response = await this.fetchImpl(this.credentials.token_uri, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString(),
        signal: controller.signal
      });
      const payload = await readJsonResponse(response, 256 * 1024);
      if (!response.ok || typeof payload.access_token !== "string" || !payload.access_token) {
        throw gscApiError(
          "gsc_oauth_refresh_failed",
          "Google OAuth token refresh failed. Reauthorize the local credential.",
          { status: response.status, retryable: response.status >= 500 }
        );
      }

      this.cachedToken = payload.access_token;
      this.cachedTokenExpiresAt = now + Math.max(1, Number(payload.expires_in) || 3600) * 1000;
      return this.cachedToken;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw gscApiError("gsc_oauth_timeout", "Google OAuth token refresh timed out.", { retryable: true });
      }
      if (error?.code) throw error;
      throw gscApiError("gsc_oauth_refresh_failed", "Google OAuth token refresh failed.", { retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GoogleSearchConsoleApiClient {
  constructor({
    tokenProvider,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    allowWrite = false
  } = {}) {
    if (!tokenProvider || typeof tokenProvider.getAccessToken !== "function") {
      throw gscApiError("gsc_token_provider_required", "A Google OAuth token provider is required.");
    }
    if (typeof fetchImpl !== "function") {
      throw gscApiError("gsc_fetch_unavailable", "A fetch implementation is required.");
    }
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.allowWrite = allowWrite;
    this.mode = allowWrite ? "live" : "live-read-only";
  }

  async listSites() {
    return this.#request("https://www.googleapis.com/webmasters/v3/sites");
  }

  async inspectUrl({ inspectionUrl, siteUrl, languageCode = "en-US" } = {}) {
    if (!inspectionUrl || !siteUrl) {
      throw gscApiError("invalid_gsc_input", "inspectionUrl and siteUrl are required.");
    }
    return this.#request("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      body: {
        inspectionUrl,
        siteUrl,
        languageCode
      }
    });
  }

  async listSitemaps({ siteUrl } = {}) {
    if (!siteUrl) throw gscApiError("invalid_gsc_input", "siteUrl is required.");
    return this.#request(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`
    );
  }

  async submitSitemap({ siteUrl, feedpath } = {}) {
    if (!siteUrl || !feedpath) {
      throw gscApiError("invalid_gsc_input", "siteUrl and feedpath are required.");
    }
    if (!this.allowWrite) {
      throw gscApiError(
        "gsc_write_scope_required",
        "Sitemap submission requires a separately approved Google webmasters write scope."
      );
    }
    return this.#request(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
      { method: "PUT" }
    );
  }

  async #request(url, { method = "GET", body } = {}) {
    const accessToken = await this.tokenProvider.getAccessToken();
    if (typeof accessToken !== "string" || !accessToken) {
      throw gscApiError("gsc_access_token_missing", "Google OAuth did not provide an access token.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await readJsonResponse(response, this.maxResponseBytes);
      if (!response.ok) throw responseError(response.status, payload);
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw gscApiError("gsc_api_timeout", "Google Search Console API request timed out.", { retryable: true });
      }
      if (error?.code) throw error;
      throw gscApiError("gsc_api_unavailable", "Google Search Console API request failed.", { retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createReadOnlyGoogleSearchConsoleApiClient({
  credentials,
  fetchImpl = globalThis.fetch,
  clock,
  timeoutMs
} = {}) {
  const tokenProvider = new AuthorizedUserTokenProvider({ credentials, fetchImpl, clock, timeoutMs });
  return new GoogleSearchConsoleApiClient({ tokenProvider, fetchImpl, timeoutMs, allowWrite: false });
}

export function normalizeAuthorizedUserCredentials(value = {}) {
  const candidate = value.authorized_user || value;
  const credentials = {
    type: String(candidate.type || "authorized_user"),
    client_id: String(candidate.client_id || "").trim(),
    client_secret: String(candidate.client_secret || "").trim(),
    refresh_token: String(candidate.refresh_token || "").trim(),
    token_uri: String(candidate.token_uri || GOOGLE_OAUTH_TOKEN_ENDPOINT).trim(),
    scope: String(candidate.scope || GOOGLE_WEBMASTERS_READONLY_SCOPE).trim()
  };
  if (credentials.type !== "authorized_user" || !credentials.client_id || !credentials.refresh_token) {
    throw gscApiError("gsc_credentials_invalid", "The authorized-user credential is incomplete.");
  }
  if (credentials.token_uri !== GOOGLE_OAUTH_TOKEN_ENDPOINT) {
    throw gscApiError("gsc_credentials_invalid", "The authorized-user token endpoint is not allowed.");
  }
  return credentials;
}

async function readJsonResponse(response, maxBytes) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw gscApiError("gsc_response_too_large", "Google API response exceeded the configured size limit.");
  }
  if (bytes.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw gscApiError("gsc_response_invalid", "Google API returned an invalid JSON response.");
  }
}

function responseError(status, payload) {
  const reason = firstAllowedReason(payload);
  if (status === 401) {
    return gscApiError("gsc_authorization_failed", "Google Search Console authorization failed.", { status });
  }
  if (status === 403 && ["quotaExceeded", "rateLimitExceeded"].includes(reason)) {
    return gscApiError("gsc_quota_exceeded", "Google Search Console API quota is currently unavailable.", { status, retryable: true });
  }
  if (status === 403) {
    return gscApiError("gsc_permission_denied", "The authorized account cannot access the requested Search Console property.", { status });
  }
  if (status === 429) {
    return gscApiError("gsc_quota_exceeded", "Google Search Console API quota is currently unavailable.", { status, retryable: true });
  }
  if (status >= 500) {
    return gscApiError("gsc_api_unavailable", "Google Search Console API is temporarily unavailable.", { status, retryable: true });
  }
  return gscApiError("gsc_api_request_failed", "Google Search Console API rejected the request.", { status });
}

function firstAllowedReason(payload) {
  const allowed = new Set(["quotaExceeded", "rateLimitExceeded", "insufficientPermissions", "forbidden"]);
  const candidates = [
    payload?.error?.status,
    ...(Array.isArray(payload?.error?.errors) ? payload.error.errors.map((item) => item?.reason) : [])
  ];
  return candidates.find((value) => allowed.has(value)) || "";
}

function gscApiError(code, message, { status = 0, retryable = false } = {}) {
  const error = new Error(message);
  error.code = code;
  error.platform = "google_search_console";
  error.status = status;
  error.retryable = retryable;
  return error;
}
