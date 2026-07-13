import crypto from "node:crypto";
import { parseCookies, verifySessionCookie } from "./session.js";

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export async function seedConfiguredTokens(store, tokens) {
  for (const token of tokens) {
    await store.upsertApiToken({
      name: token.name,
      tokenHash: hashToken(token.token),
      scopes: token.scopes,
      executorId: token.executorId || "",
      expiresAt: token.expiresAt || null
    });
  }
}

export function requireApiScope(scope) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }

    const tokenHash = hashToken(match[1]);
    const record = await req.app.locals.store.findApiTokenByHash(tokenHash);
    if (!record || record.revokedAt) {
      res.status(401).json({ error: "invalid_bearer_token" });
      return;
    }
    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      res.status(401).json({ error: "expired_bearer_token" });
      return;
    }
    if (!record.scopes.includes(scope)) {
      res.status(403).json({ error: "missing_scope", scope });
      return;
    }

    req.actor = {
      type: "api_token",
      name: record.name,
      scopes: record.scopes,
      executorId: record.executorId || ""
    };
    next();
  };
}

export function requireAppSession(req, res, next) {
  const cookies = parseCookies(req.get("cookie") || "");
  const session = verifySessionCookie(cookies.ai_link_session, req.app.locals.config.sessionSecret);
  if (!session) {
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
    return;
  }
  req.actor = {
    type: "app_session",
    name: session.actor || "console"
  };
  next();
}
