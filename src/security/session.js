import crypto from "node:crypto";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

export function createSessionCookie({ actor, secret, secure }) {
  const payload = JSON.stringify({
    actor,
    issuedAt: new Date().toISOString()
  });
  const encoded = base64url(payload);
  const signature = sign(encoded, secret);
  const attributes = [
    `ai_link_session=${encodeURIComponent(`${encoded}.${signature}`)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=28800"
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function verifySessionCookie(cookieValue, secret) {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function clearSessionCookie() {
  return "ai_link_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}
