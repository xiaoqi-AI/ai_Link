import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  AuthorizedUserTokenProvider,
  GoogleSearchConsoleApiClient,
  GOOGLE_WEBMASTERS_READONLY_SCOPE,
  createReadOnlyGoogleSearchConsoleApiClient
} from "../src/connectors/googleSearchConsoleApi.js";
import { GoogleSearchConsoleConnector } from "../src/connectors/googleSearchConsole.js";
import {
  authorizeGoogleDesktop,
  buildGoogleAuthorizationUrl,
  createPkcePair,
  loadAuthorizedUserCredentials,
  resolveCredentialPath,
  saveAuthorizedUserCredentials
} from "../src/connectors/googleOAuthDesktop.js";

const desktopClient = {
  installed: {
    client_id: "desktop-client-id.apps.googleusercontent.com",
    client_secret: "desktop-client-secret",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token"
  }
};

const authorizedUser = {
  type: "authorized_user",
  client_id: "desktop-client-id.apps.googleusercontent.com",
  client_secret: "desktop-client-secret",
  refresh_token: "refresh-value",
  token_uri: "https://oauth2.googleapis.com/token",
  scope: GOOGLE_WEBMASTERS_READONLY_SCOPE
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Google Search Console live read-only client", () => {
  it("refreshes an authorized-user credential in memory and reuses the access token", async () => {
    const calls = [];
    const provider = new AuthorizedUserTokenProvider({
      credentials: authorizedUser,
      clock: () => 1_000_000,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return jsonResponse({ access_token: "access-value", expires_in: 3600 });
      }
    });

    assert.equal(await provider.getAccessToken(), "access-value");
    assert.equal(await provider.getAccessToken(), "access-value");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
    assert.match(calls[0].options.body, /grant_type=refresh_token/);
  });

  it("calls Sites, URL Inspection, and Sitemaps with official REST shapes", async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access-value", expires_in: 3600 });
      }
      if (url.endsWith("/sites")) return jsonResponse({ siteEntry: [] });
      if (url.includes("urlInspection")) return jsonResponse({ inspectionResult: {} });
      return jsonResponse({ sitemap: [] });
    };
    const client = createReadOnlyGoogleSearchConsoleApiClient({
      credentials: authorizedUser,
      fetchImpl,
      clock: () => 1_000_000
    });
    assert.equal(client.mode, "live-read-only");

    await client.listSites();
    await client.inspectUrl({
      inspectionUrl: "https://voice.example.com/guide",
      siteUrl: "https://voice.example.com/",
      languageCode: "en-US"
    });
    await client.listSitemaps({ siteUrl: "https://voice.example.com/" });

    const apiCalls = calls.filter((call) => call.url !== "https://oauth2.googleapis.com/token");
    assert.equal(apiCalls[0].url, "https://www.googleapis.com/webmasters/v3/sites");
    assert.equal(apiCalls[0].options.headers.Authorization, "Bearer access-value");
    assert.equal(apiCalls[1].url, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect");
    assert.deepEqual(JSON.parse(apiCalls[1].options.body), {
      inspectionUrl: "https://voice.example.com/guide",
      siteUrl: "https://voice.example.com/",
      languageCode: "en-US"
    });
    assert.equal(
      apiCalls[2].url,
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fvoice.example.com%2F/sitemaps"
    );
  });

  it("keeps sitemap submission blocked until a write-capable client is explicitly constructed", async () => {
    const calls = [];
    const tokenProvider = { getAccessToken: async () => "access-value" };
    const readOnly = new GoogleSearchConsoleApiClient({ tokenProvider, fetchImpl: async () => jsonResponse({}) });
    const connector = new GoogleSearchConsoleConnector({ apiClient: readOnly });
    assert.equal(connector.capabilityModes.submit_sitemap, "approval-and-write-scope-required");
    await assert.rejects(
      readOnly.submitSitemap({
        siteUrl: "https://voice.example.com/",
        feedpath: "https://voice.example.com/sitemap.xml"
      }),
      (error) => error.code === "gsc_write_scope_required"
    );

    const writeClient = new GoogleSearchConsoleApiClient({
      tokenProvider,
      allowWrite: true,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(null, { status: 204 });
      }
    });
    await writeClient.submitSitemap({
      siteUrl: "https://voice.example.com/",
      feedpath: "https://voice.example.com/sitemap.xml"
    });
    assert.equal(calls[0].options.method, "PUT");
    assert.equal(
      calls[0].url,
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fvoice.example.com%2F/sitemaps/https%3A%2F%2Fvoice.example.com%2Fsitemap.xml"
    );
  });

  it("returns stable errors without exposing Google response text", async () => {
    const client = new GoogleSearchConsoleApiClient({
      tokenProvider: { getAccessToken: async () => "access-value" },
      fetchImpl: async () => jsonResponse({
        error: {
          message: "private third-party message with credential-value",
          errors: [{ reason: "forbidden" }]
        }
      }, 403)
    });

    await assert.rejects(client.listSites(), (error) => {
      assert.equal(error.code, "gsc_permission_denied");
      assert.equal(error.message.includes("credential-value"), false);
      assert.equal(JSON.stringify(error).includes("private third-party"), false);
      return true;
    });
  });
});

describe("Google Search Console desktop OAuth", () => {
  it("builds a read-only PKCE authorization request", () => {
    const pair = createPkcePair();
    assert.equal(pair.verifier.length >= 43, true);
    assert.equal(pair.challenge.includes("="), false);
    const url = new URL(buildGoogleAuthorizationUrl({
      clientConfig: desktopClient,
      redirectUri: "http://127.0.0.1:54321/oauth2callback",
      state: "state-value",
      codeChallenge: pair.challenge
    }));

    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("scope"), GOOGLE_WEBMASTERS_READONLY_SCOPE);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
  });

  it("completes a loopback authorization without printing or persisting the access token", async () => {
    let openedUrl = "";
    const credentials = await authorizeGoogleDesktop({
      clientConfig: desktopClient,
      timeoutMs: 5_000,
      openBrowserImpl: async (url) => {
        openedUrl = url;
        const authorization = new URL(url);
        const callback = new URL(authorization.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "authorization-code");
        callback.searchParams.set("state", authorization.searchParams.get("state"));
        const response = await fetch(callback);
        assert.equal(response.status, 200);
      },
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://oauth2.googleapis.com/token");
        assert.match(options.body, /code_verifier=/);
        return jsonResponse({
          access_token: "ephemeral-access-value",
          refresh_token: "refresh-value",
          expires_in: 3600,
          scope: GOOGLE_WEBMASTERS_READONLY_SCOPE,
          token_type: "Bearer"
        });
      }
    });

    assert.match(openedUrl, /^https:\/\/accounts\.google\.com\//);
    assert.equal(credentials.refresh_token, "refresh-value");
    assert.equal("access_token" in credentials, false);
  });

  it("requires repository-local credentials to stay under runtime/private", async () => {
    assert.throws(
      () => resolveCredentialPath("credentials.json"),
      (error) => error.code === "gsc_credentials_path_unsafe"
    );

    const root = await mkdtemp(path.join(tmpdir(), "ai-link-gsc-oauth-"));
    try {
      const output = await saveAuthorizedUserCredentials(
        "runtime/private/google-search-console/authorized-user.json",
        { ...authorizedUser, access_token: "must-not-persist" },
        { cwd: root }
      );
      const saved = JSON.parse(await readFile(output, "utf8"));
      assert.equal(saved.refresh_token, "refresh-value");
      assert.equal("access_token" in saved, false);
      assert.equal(resolveCredentialPath(output, { cwd: root }), output);
      await assert.rejects(
        loadAuthorizedUserCredentials("runtime/private/google-search-console/missing.json", { cwd: root }),
        (error) => error.code === "gsc_credentials_unavailable" && !error.message.includes(root)
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
