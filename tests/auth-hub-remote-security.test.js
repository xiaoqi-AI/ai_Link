import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { parseCookies, createSessionCookie, verifySessionCookie } from "../src/security/session.js";
import { MemoryStore } from "../src/storage/memoryStore.js";

const AUDIENCE = "test-cloudflare-access-audience";
const KEY_ID = "test-cloudflare-access-key";
const ADMIN_TOKEN = "test-remote-security-admin-token";
const SESSION_SECRET = "test-remote-security-session-secret";

let issuer;
let privateKey;
let jwksServer;

before(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.alg = "RS256";
  jwk.kid = KEY_ID;
  jwk.use = "sig";

  jwksServer = createServer((req, res) => {
    if (req.url !== "/cdn-cgi/access/certs") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${jwksServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => jwksServer.close(resolve));
});

describe("Auth Hub remote access security", () => {
  it("requires complete Cloudflare JWT verification settings in production", () => {
    assert.throws(() => loadConfig({
      NODE_ENV: "production",
      AI_LINK_BASE_URL: "https://auth.example.com",
      AI_LINK_APP_PASSWORD: "test-remote-app-password",
      AI_LINK_SESSION_SECRET: SESSION_SECRET,
      AI_LINK_ADMIN_TOKEN: ADMIN_TOKEN,
      AI_LINK_EXECUTOR_TOKEN: "test-remote-executor-token",
      AI_LINK_EXECUTOR_ID: "remote-executor",
      AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "true",
      AI_LINK_CLOUDFLARE_ACCESS_AUD: AUDIENCE,
      AI_LINK_CLOUDFLARE_ACCESS_ISSUER: "https://test-team.cloudflareaccess.com",
      AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com"
    }), /DATABASE_URL/);

    assert.throws(() => loadConfig({
      NODE_ENV: "production",
      AI_LINK_BASE_URL: "https://auth.example.com",
      DATABASE_URL: "postgres://test-only.invalid/auth_hub",
      AI_LINK_APP_PASSWORD: "test-remote-app-password",
      AI_LINK_SESSION_SECRET: SESSION_SECRET,
      AI_LINK_ADMIN_TOKEN: ADMIN_TOKEN,
      AI_LINK_EXECUTOR_TOKEN: "test-remote-executor-token",
      AI_LINK_EXECUTOR_ID: "remote-executor",
      AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "true",
      AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com"
    }), /AI_LINK_CLOUDFLARE_ACCESS_AUD/);

    assert.throws(() => loadConfig({
      NODE_ENV: "production",
      AI_LINK_BASE_URL: "https://auth.example.com",
      DATABASE_URL: "postgres://test-only.invalid/auth_hub",
      AI_LINK_APP_PASSWORD: "test-remote-app-password",
      AI_LINK_SESSION_SECRET: SESSION_SECRET,
      AI_LINK_ADMIN_TOKEN: ADMIN_TOKEN,
      AI_LINK_EXECUTOR_TOKEN: "test-remote-executor-token",
      AI_LINK_EXECUTOR_ID: "remote-executor",
      AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "true",
      AI_LINK_CLOUDFLARE_ACCESS_AUD: AUDIENCE
    }), /AI_LINK_CLOUDFLARE_TEAM_DOMAIN or AI_LINK_CLOUDFLARE_ACCESS_ISSUER/);
  });

  it("binds forwarded email to a verified user JWT and accepts an allowed service token", async () => {
    const server = await startHub();
    try {
      const ownerJwt = await accessJwt({ email: "owner@example.com", sub: "owner-subject" });
      const owner = await apiTasks(server.baseUrl, ownerJwt);
      assert.equal(owner.response.status, 200);

      const matchingHeader = await apiTasks(server.baseUrl, ownerJwt, "OWNER@example.com");
      assert.equal(matchingHeader.response.status, 200);

      const mismatchedHeader = await apiTasks(server.baseUrl, ownerJwt, "other@example.com");
      assert.equal(mismatchedHeader.response.status, 403);
      assert.equal(mismatchedHeader.data.detail, "cloudflare_access_identity_mismatch");

      const invalidSignature = await apiTasks(server.baseUrl, `${ownerJwt}x`);
      assert.equal(invalidSignature.response.status, 403);
      assert.equal(invalidSignature.data.detail, "invalid_cloudflare_access_jwt");

      const wrongTypeJwt = await accessJwt({ type: "org", email: "owner@example.com", sub: "owner-subject" });
      const wrongType = await apiTasks(server.baseUrl, wrongTypeJwt);
      assert.equal(wrongType.response.status, 403);
      assert.equal(wrongType.data.detail, "invalid_cloudflare_access_token_type");

      const unlistedJwt = await accessJwt({ email: "other@example.com", sub: "other-subject" });
      const unlisted = await apiTasks(server.baseUrl, unlistedJwt);
      assert.equal(unlisted.response.status, 403);
      assert.equal(unlisted.data.detail, "email_not_allowed");

      const serviceJwt = await accessJwt({ common_name: "service-client.access", sub: "" });
      const service = await apiTasks(server.baseUrl, serviceJwt);
      assert.equal(service.response.status, 200);

      const disguisedService = await apiTasks(server.baseUrl, serviceJwt, "owner@example.com");
      assert.equal(disguisedService.response.status, 403);
      assert.equal(disguisedService.data.detail, "cloudflare_access_identity_mismatch");
    } finally {
      await server.close();
    }
  });

  it("rejects a verified service token unless service-token access is explicit", async () => {
    const server = await startHub({
      AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN: "false"
    });
    try {
      const serviceJwt = await accessJwt({ common_name: "service-client.access", sub: "" });
      const denied = await apiTasks(server.baseUrl, serviceJwt);
      assert.equal(denied.response.status, 403);
      assert.equal(denied.data.detail, "service_token_not_allowed");
    } finally {
      await server.close();
    }
  });

  it("enforces signed server-side console session expiry and handles malformed cookies", () => {
    const issuedAt = Date.parse("2026-07-13T00:00:00.000Z");
    const header = createSessionCookie({
      actor: "console",
      secret: SESSION_SECRET,
      secure: true,
      maxAgeSeconds: 600,
      now: issuedAt
    });
    assert.match(header, /Max-Age=600/);
    assert.match(header, /; Secure$/);

    const cookie = parseCookies(header).ai_link_session;
    const active = verifySessionCookie(cookie, SESSION_SECRET, { now: issuedAt + 599000 });
    assert.equal(active.actor, "console");
    assert.equal(active.expiresAt, "2026-07-13T00:10:00.000Z");
    assert.equal(verifySessionCookie(cookie, SESSION_SECRET, { now: issuedAt + 600000 }), null);
    assert.doesNotThrow(() => verifySessionCookie(`${cookie}x`, SESSION_SECRET));
    assert.equal(verifySessionCookie(`${cookie}x`, SESSION_SECRET), null);
    assert.doesNotThrow(() => parseCookies("ai_link_session=%E0%A4%A"));
    assert.equal(parseCookies("ai_link_session=%E0%A4%A").ai_link_session, "");
  });
});

async function startHub(envOverrides = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_LINK_APP_PASSWORD: "test-remote-app-password",
    AI_LINK_SESSION_SECRET: SESSION_SECRET,
    AI_LINK_ADMIN_TOKEN: ADMIN_TOKEN,
    AI_LINK_EXECUTOR_TOKEN: "test-remote-executor-token",
    AI_LINK_EXECUTOR_ID: "remote-executor",
    AI_LINK_REQUIRE_CLOUDFLARE_ACCESS: "true",
    AI_LINK_ALLOWED_ACCESS_EMAILS: "owner@example.com",
    AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN: "true",
    AI_LINK_CLOUDFLARE_ACCESS_AUD: AUDIENCE,
    AI_LINK_CLOUDFLARE_ACCESS_ISSUER: issuer,
    ...envOverrides
  });
  const { app } = await createApp({
    config,
    store: new MemoryStore(),
    notifier: { approvalRequested: async () => {} }
  });
  const listener = await new Promise((resolve) => {
    const running = app.listen(0, "127.0.0.1", () => resolve(running));
  });
  return {
    baseUrl: `http://127.0.0.1:${listener.address().port}`,
    close: () => new Promise((resolve) => listener.close(resolve))
  };
}

async function accessJwt(identity) {
  return new SignJWT({ type: "app", ...identity })
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setNotBefore("-5s")
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function apiTasks(baseUrl, assertion, forwardedEmail = "") {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      "cf-access-jwt-assertion": assertion,
      ...(forwardedEmail ? { "cf-access-authenticated-user-email": forwardedEmail } : {})
    }
  });
  return { response, data: await response.json() };
}
