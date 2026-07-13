import crypto from "node:crypto";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;

export class LoginRateLimiter {
  constructor({
    maxFailures = 5,
    windowMs = DEFAULT_WINDOW_MS,
    blockMs = DEFAULT_BLOCK_MS,
    maxKeys = 1000,
    clock = () => Date.now()
  } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.blockMs = blockMs;
    this.maxKeys = maxKeys;
    this.clock = clock;
    this.entries = new Map();
  }

  check(key) {
    const now = this.clock();
    this.prune(now);
    const entry = this.entries.get(key);
    if (!entry) return { allowed: true, retryAfterSeconds: 0 };
    if (entry.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
      };
    }
    if (entry.windowStartedAt + this.windowMs <= now) {
      this.entries.delete(key);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailure(key) {
    const now = this.clock();
    this.prune(now);
    const existing = this.entries.get(key);
    const reset = !existing
      || existing.blockedUntil <= now && existing.windowStartedAt + this.windowMs <= now;
    const entry = reset
      ? { failures: 0, windowStartedAt: now, blockedUntil: 0, updatedAt: now }
      : existing;

    entry.failures += 1;
    entry.updatedAt = now;
    if (entry.failures >= this.maxFailures) {
      entry.blockedUntil = now + this.blockMs;
    }
    this.entries.set(key, entry);
    this.enforceCapacity();
    return { failures: entry.failures, blocked: entry.blockedUntil > now };
  }

  reset(key) {
    this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }

  prune(now = this.clock()) {
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil <= now && entry.windowStartedAt + this.windowMs <= now) {
        this.entries.delete(key);
      }
    }
  }

  enforceCapacity() {
    if (this.entries.size <= this.maxKeys) return;
    const oldest = [...this.entries.entries()]
      .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
      .slice(0, this.entries.size - this.maxKeys);
    for (const [key] of oldest) this.entries.delete(key);
  }
}

export function loginRateLimitKey(req, secret) {
  return opaqueIdentity(req, secret, "rate");
}

export function browserSessionActor(req, secret) {
  if (!req.cloudflareAccess) return "console";
  if (req.cloudflareAccess.serviceToken) return "";
  return `access:${opaqueIdentity(req, secret, "session").slice(0, 32)}`;
}

export function secureSecretEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left || "")).digest();
  const rightHash = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function normalizeNetworkAddress(value) {
  const normalized = String(value || "unknown").trim().toLowerCase();
  return /^[a-f0-9:.]{1,64}$/.test(normalized) ? normalized : "unknown";
}

function opaqueIdentity(req, secret, purpose) {
  const verifiedEmail = String(req.cloudflareAccess?.email || "").trim().toLowerCase();
  const identity = verifiedEmail
    ? `access-email:${verifiedEmail}`
    : req.cloudflareAccess?.serviceToken
      ? "access-service-token"
      : `network:${normalizeNetworkAddress(req.ip || req.socket?.remoteAddress || "unknown")}`;
  return crypto.createHmac("sha256", secret).update(`${purpose}:${identity}`).digest("base64url");
}
