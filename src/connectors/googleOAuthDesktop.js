import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import {
  GOOGLE_OAUTH_TOKEN_ENDPOINT,
  GOOGLE_WEBMASTERS_READONLY_SCOPE,
  normalizeAuthorizedUserCredentials
} from "./googleSearchConsoleApi.js";

const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";

export function createPkcePair() {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function normalizeGoogleDesktopClientConfig(value = {}) {
  const candidate = value.installed || value;
  const config = {
    clientId: String(candidate.client_id || "").trim(),
    clientSecret: String(candidate.client_secret || "").trim(),
    authUri: String(candidate.auth_uri || DEFAULT_AUTH_URI).trim(),
    tokenUri: String(candidate.token_uri || GOOGLE_OAUTH_TOKEN_ENDPOINT).trim()
  };
  if (!value.installed || !config.clientId) {
    throw oauthError("gsc_oauth_client_invalid", "A Google Desktop app OAuth client configuration is required.");
  }
  let authUrl;
  try {
    authUrl = new URL(config.authUri);
  } catch {
    throw oauthError("gsc_oauth_client_invalid", "The Google OAuth authorization endpoint is invalid.");
  }
  if (authUrl.protocol !== "https:" || authUrl.hostname !== "accounts.google.com") {
    throw oauthError("gsc_oauth_client_invalid", "The Google OAuth authorization endpoint is not allowed.");
  }
  if (config.tokenUri !== GOOGLE_OAUTH_TOKEN_ENDPOINT) {
    throw oauthError("gsc_oauth_client_invalid", "The Google OAuth token endpoint is not allowed.");
  }
  return config;
}

export function buildGoogleAuthorizationUrl({
  clientConfig,
  redirectUri,
  state,
  codeChallenge,
  scope = GOOGLE_WEBMASTERS_READONLY_SCOPE
}) {
  const config = normalizeGoogleDesktopClientConfig(clientConfig);
  const url = new URL(config.authUri);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    include_granted_scopes: "false"
  }).toString();
  return url.toString();
}

export async function authorizeGoogleDesktop({
  clientConfig,
  fetchImpl = globalThis.fetch,
  openBrowserImpl = openSystemBrowser,
  timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
  scope = GOOGLE_WEBMASTERS_READONLY_SCOPE
} = {}) {
  if (scope !== GOOGLE_WEBMASTERS_READONLY_SCOPE) {
    throw oauthError("gsc_oauth_scope_not_allowed", "This authorization helper only permits the Search Console read-only scope.");
  }
  if (typeof fetchImpl !== "function") {
    throw oauthError("gsc_fetch_unavailable", "A fetch implementation is required.");
  }
  const config = normalizeGoogleDesktopClientConfig(clientConfig);
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(32).toString("base64url");
  const callback = await startLoopbackCallback({ state, timeoutMs });
  const authorizationUrl = buildGoogleAuthorizationUrl({
    clientConfig,
    redirectUri: callback.redirectUri,
    state,
    codeChallenge: challenge,
    scope
  });

  try {
    await openBrowserImpl(authorizationUrl);
    const code = await callback.codePromise;
    const token = await exchangeAuthorizationCode({
      config,
      code,
      codeVerifier: verifier,
      redirectUri: callback.redirectUri,
      fetchImpl,
      timeoutMs
    });
    const grantedScopes = String(token.scope || scope).split(/\s+/).filter(Boolean);
    if (!grantedScopes.includes(GOOGLE_WEBMASTERS_READONLY_SCOPE)) {
      throw oauthError("gsc_oauth_scope_missing", "Google did not grant the required Search Console read-only scope.");
    }
    if (typeof token.refresh_token !== "string" || !token.refresh_token) {
      throw oauthError(
        "gsc_oauth_refresh_token_missing",
        "Google did not return a refresh token. Revoke the prior test grant and authorize again."
      );
    }
    return normalizeAuthorizedUserCredentials({
      type: "authorized_user",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refresh_token,
      token_uri: config.tokenUri,
      scope: grantedScopes.join(" ")
    });
  } finally {
    await callback.close();
  }
}

export async function loadGoogleDesktopClientConfig(filePath, options = {}) {
  const resolved = resolveCredentialPath(filePath, options);
  try {
    return JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw oauthError("gsc_oauth_client_invalid", "The Google Desktop app client configuration is not valid JSON.");
    }
    throw oauthError("gsc_oauth_client_unavailable", "The Google Desktop app client configuration could not be read.");
  }
}

export async function loadAuthorizedUserCredentials(filePath, options = {}) {
  const resolved = resolveCredentialPath(filePath, options);
  try {
    return normalizeAuthorizedUserCredentials(JSON.parse(await readFile(resolved, "utf8")));
  } catch (error) {
    if (String(error?.code || "").startsWith("gsc_")) throw error;
    throw oauthError("gsc_credentials_unavailable", "The local authorized-user credential could not be read.");
  }
}

export async function saveAuthorizedUserCredentials(filePath, credentials, { force = false, ...options } = {}) {
  const resolved = resolveCredentialPath(filePath, options);
  const safeCredentials = normalizeAuthorizedUserCredentials(credentials);
  await mkdir(path.dirname(resolved), { recursive: true });
  try {
    await writeFile(resolved, `${JSON.stringify(safeCredentials, null, 2)}\n`, {
      encoding: "utf8",
      flag: force ? "w" : "wx",
      mode: 0o600
    });
    await chmod(resolved, 0o600).catch(() => {});
    return resolved;
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw oauthError("gsc_credentials_exist", "The credential output already exists. Use --force only after confirming replacement.");
    }
    throw oauthError("gsc_credentials_write_failed", "The authorized-user credential could not be saved.");
  }
}

export function resolveCredentialPath(filePath, { cwd = process.cwd() } = {}) {
  if (!filePath) throw oauthError("gsc_credentials_path_required", "A credential file path is required.");
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, filePath);
  const relative = path.relative(root, resolved);
  const insideRoot = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  if (insideRoot) {
    const privateRoot = path.resolve(root, "runtime", "private");
    const privateRelative = path.relative(privateRoot, resolved);
    const insidePrivate = privateRelative === "" || (!privateRelative.startsWith(`..${path.sep}`) && privateRelative !== ".." && !path.isAbsolute(privateRelative));
    if (!insidePrivate) {
      throw oauthError("gsc_credentials_path_unsafe", "Credential files inside the repository must stay under runtime/private/.");
    }
  }
  return resolved;
}

async function exchangeAuthorizationCode({
  config,
  code,
  codeVerifier,
  redirectUri,
  fetchImpl,
  timeoutMs
}) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(config.tokenUri, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      signal: controller.signal
    });
    const payload = await readLimitedJson(response, 256 * 1024);
    if (!response.ok) {
      throw oauthError("gsc_oauth_exchange_failed", "Google OAuth authorization-code exchange failed.");
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw oauthError("gsc_oauth_timeout", "Google OAuth authorization-code exchange timed out.");
    }
    if (error?.code) throw error;
    throw oauthError("gsc_oauth_exchange_failed", "Google OAuth authorization-code exchange failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function startLoopbackCallback({ state, timeoutMs }) {
  let resolveCode;
  let rejectCode;
  let settled = false;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== "/oauth2callback") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }
    if (url.searchParams.get("state") !== state) {
      respondBrowser(response, 400, "Authorization state did not match. Return to the terminal.");
      settleReject(oauthError("gsc_oauth_state_mismatch", "Google OAuth callback state did not match."));
      return;
    }
    if (url.searchParams.get("error")) {
      respondBrowser(response, 400, "Authorization was not completed. Return to the terminal.");
      settleReject(oauthError("gsc_oauth_denied", "Google OAuth authorization was not completed."));
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      respondBrowser(response, 400, "Authorization code was missing. Return to the terminal.");
      settleReject(oauthError("gsc_oauth_code_missing", "Google OAuth callback did not contain an authorization code."));
      return;
    }
    respondBrowser(response, 200, "Read-only authorization received. You can close this tab and return to the terminal.");
    settleResolve(code);
  });

  function settleResolve(value) {
    if (settled) return;
    settled = true;
    resolveCode(value);
  }

  function settleReject(error) {
    if (settled) return;
    settled = true;
    rejectCode(error);
  }

  server.on("error", () => settleReject(oauthError("gsc_oauth_callback_failed", "The local OAuth callback server failed.")));
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const timeout = setTimeout(() => {
    settleReject(oauthError("gsc_oauth_timeout", "Google OAuth authorization timed out."));
  }, timeoutMs);

  return {
    redirectUri,
    codePromise,
    async close() {
      clearTimeout(timeout);
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function respondBrowser(response, status, message) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "Content-Type": "text/html; charset=utf-8",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer"
  });
  response.end(`<!doctype html><meta charset="utf-8"><title>AI Link GSC OAuth</title><style>body{font:16px system-ui;max-width:680px;margin:12vh auto;padding:24px;line-height:1.6}h1{font-size:24px}</style><h1>AI Link GSC OAuth</h1><p>${message}</p>`);
}

async function readLimitedJson(response, maxBytes) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw oauthError("gsc_oauth_response_too_large", "Google OAuth response exceeded the configured size limit.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw oauthError("gsc_oauth_response_invalid", "Google OAuth returned an invalid JSON response.");
  }
}

function openSystemBrowser(url) {
  const command = process.platform === "win32" ? "rundll32" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => reject(oauthError("gsc_oauth_browser_failed", "The system browser could not be opened.")));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function oauthError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.platform = "google_search_console";
  error.retryable = false;
  return error;
}
