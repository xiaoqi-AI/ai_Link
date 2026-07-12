import crypto from "node:crypto";
import { parseCookies } from "./session.js";

const BROWSER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}\.[a-z0-9]{1,12}\.[A-Za-z0-9_-]{43}$/;
const DEFAULT_MAX_AGE_SECONDS = 28800;
const DEFAULT_TOKEN_TTL_SECONDS = 900;

export function issueCsrfToken(req, res, {
  secret,
  secure = false,
  sessionCookie = "",
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  tokenTtlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
  now = Date.now()
}) {
  const cookieName = csrfCookieName(secure);
  const cookies = parseCookies(req.get("cookie") || "");
  const existing = String(cookies[cookieName] || "");
  const browserToken = BROWSER_TOKEN_PATTERN.test(existing)
    ? existing
    : crypto.randomBytes(32).toString("base64url");

  if (browserToken !== existing) {
    appendSetCookie(res, createCsrfCookie({
      name: cookieName,
      value: browserToken,
      secure,
      maxAgeSeconds
    }));
  }

  return signCsrfToken({ browserToken, sessionCookie, secret, tokenTtlSeconds, now });
}

export function requireCsrfToken({ authenticated = false } = {}) {
  return (req, res, next) => {
    if (!hasExpectedOrigin(req)) {
      res.status(403).send("Invalid request origin.");
      return;
    }
    const secure = req.app.locals.config.isProduction;
    const cookieName = csrfCookieName(secure);
    const cookies = parseCookies(req.get("cookie") || "");
    const browserToken = String(cookies[cookieName] || "");
    const supplied = String(req.body?.csrfToken || "");
    const sessionCookie = authenticated ? String(cookies.ai_link_session || "") : "";

    if (
      !BROWSER_TOKEN_PATTERN.test(browserToken)
      || !CSRF_TOKEN_PATTERN.test(supplied)
      || (authenticated && !sessionCookie)
    ) {
      res.status(403).send("Invalid request token.");
      return;
    }

    if (!verifyCsrfToken({
      token: supplied,
      browserToken,
      sessionCookie,
      secret: req.app.locals.config.sessionSecret,
      now: req.app.locals.clock()
    })) {
      res.status(403).send("Invalid request token.");
      return;
    }
    next();
  };
}

function hasExpectedOrigin(req) {
  const config = req.app.locals.config;
  let expectedOrigin = "";
  try {
    expectedOrigin = config.isProduction
      ? new URL(config.baseUrl).origin
      : `${req.protocol}://${req.get("host")}`;
  } catch {
    return false;
  }

  const origin = String(req.get("origin") || "").trim();
  if (origin) return safeOrigin(origin) === expectedOrigin;
  const referer = String(req.get("referer") || "").trim();
  return Boolean(referer) && safeOrigin(referer) === expectedOrigin;
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function clearCsrfCookie({ secure = false } = {}) {
  return createCsrfCookie({
    name: csrfCookieName(secure),
    value: "",
    secure,
    maxAgeSeconds: 0
  });
}

function signCsrfToken({ browserToken, sessionCookie, secret, tokenTtlSeconds, now }) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const ttlSeconds = Math.min(3600, Math.max(300, Math.floor(Number(tokenTtlSeconds) || DEFAULT_TOKEN_TTL_SECONDS)));
  const expiresAt = Math.floor(Number(now) / 1000) + ttlSeconds;
  const payload = `${nonce}.${expiresAt.toString(36)}`;
  const binding = crypto.createHash("sha256").update(sessionCookie || "preauth").digest("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${payload}.${browserToken}.${binding}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyCsrfToken({ token, browserToken, sessionCookie, secret, now }) {
  const [nonce, encodedExpiry, suppliedSignature] = token.split(".");
  const expiresAt = Number.parseInt(encodedExpiry, 36);
  if (
    !nonce
    || !Number.isFinite(expiresAt)
    || expiresAt <= Math.floor(Number(now) / 1000)
  ) {
    return false;
  }
  const payload = `${nonce}.${encodedExpiry}`;
  const binding = crypto.createHash("sha256").update(sessionCookie || "preauth").digest("base64url");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${payload}.${browserToken}.${binding}`)
    .digest("base64url");
  return safeEqual(suppliedSignature, expectedSignature);
}

function csrfCookieName(secure) {
  return secure ? "__Host-ai_link_csrf" : "ai_link_csrf";
}

function createCsrfCookie({ name, value, secure, maxAgeSeconds }) {
  const boundedMaxAge = Math.max(0, Math.min(86400, Math.floor(Number(maxAgeSeconds) || 0)));
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${boundedMaxAge}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function appendSetCookie(res, value) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, value] : [existing, value]);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
