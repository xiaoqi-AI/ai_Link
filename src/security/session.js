import crypto from "node:crypto";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

const DEFAULT_SESSION_MAX_AGE_SECONDS = 28800;

export function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [safeDecode(item.slice(0, index)), safeDecode(item.slice(index + 1))];
      })
  );
}

export function createSessionCookie({
  actor,
  secret,
  secure,
  maxAgeSeconds = DEFAULT_SESSION_MAX_AGE_SECONDS,
  now = Date.now()
}) {
  const nowMs = finiteTime(now);
  const sessionSeconds = boundedSessionSeconds(maxAgeSeconds);
  const payload = JSON.stringify({
    schemaVersion: "1",
    actor,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + sessionSeconds * 1000).toISOString()
  });
  const encoded = base64url(payload);
  const signature = sign(encoded, secret);
  const attributes = [
    `ai_link_session=${encodeURIComponent(`${encoded}.${signature}`)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionSeconds}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function verifySessionCookie(cookieValue, secret, { now = Date.now() } = {}) {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const issuedAt = Date.parse(parsed?.issuedAt);
    const expiresAt = Date.parse(parsed?.expiresAt);
    const nowMs = finiteTime(now);
    if (
      parsed?.schemaVersion !== "1"
      || typeof parsed.actor !== "string"
      || parsed.actor.length < 1
      || parsed.actor.length > 80
      || !Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt)
      || expiresAt <= issuedAt
      || issuedAt > nowMs + 300000
      || expiresAt <= nowMs
    ) {
      return null;
    }
    return {
      actor: parsed.actor,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}

export function clearSessionCookie({ secure = false } = {}) {
  return [
    "ai_link_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function finiteTime(value) {
  const parsed = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function boundedSessionSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  return Math.min(86400, Math.max(300, Math.floor(parsed)));
}
