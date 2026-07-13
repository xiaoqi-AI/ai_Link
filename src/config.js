import crypto from "node:crypto";

function readCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function devSecret(label) {
  return `dev-${label}-${crypto.createHash("sha256").update(label).digest("hex").slice(0, 24)}`;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const baseUrl = env.AI_LINK_BASE_URL || `http://localhost:${env.PORT || 10000}`;

  const appPassword = env.AI_LINK_APP_PASSWORD || (isProduction ? "" : "dev-password");
  const sessionSecret = env.AI_LINK_SESSION_SECRET || (isProduction ? "" : devSecret("session"));
  const adminToken = env.AI_LINK_ADMIN_TOKEN || (isProduction ? "" : "dev-admin-token");
  const executorToken = env.AI_LINK_EXECUTOR_TOKEN || (isProduction ? "" : "dev-executor-token");
  const executorId = String(env.AI_LINK_EXECUTOR_ID || "").trim();
  if (executorId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(executorId)) {
    throw new Error("AI_LINK_EXECUTOR_ID has an invalid format.");
  }
  const codexToken = env.AI_LINK_CODEX_TOKEN || (isProduction ? "" : "dev-codex-token");
  const requireCloudflareAccess = ["1", "true", "yes"].includes(
    String(env.AI_LINK_REQUIRE_CLOUDFLARE_ACCESS || "").toLowerCase()
  );
  const allowedAccessEmails = readCsv(env.AI_LINK_ALLOWED_ACCESS_EMAILS).map((item) => item.toLowerCase());
  const allowCloudflareServiceTokens = ["1", "true", "yes"].includes(
    String(env.AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN || "").toLowerCase()
  );
  const cloudflareAccessAudience = String(env.AI_LINK_CLOUDFLARE_ACCESS_AUD || "").trim();
  const cloudflareAccessIssuer = String(env.AI_LINK_CLOUDFLARE_ACCESS_ISSUER || "").trim();
  const cloudflareTeamDomain = String(env.AI_LINK_CLOUDFLARE_TEAM_DOMAIN || "").trim();

  if (isProduction) {
    const missing = [];
    if (!appPassword) missing.push("AI_LINK_APP_PASSWORD");
    if (!sessionSecret) missing.push("AI_LINK_SESSION_SECRET");
    if (!adminToken) missing.push("AI_LINK_ADMIN_TOKEN");
    if (!executorToken) missing.push("AI_LINK_EXECUTOR_TOKEN");
    if (!executorId) missing.push("AI_LINK_EXECUTOR_ID");
    if (requireCloudflareAccess && !cloudflareAccessAudience) {
      missing.push("AI_LINK_CLOUDFLARE_ACCESS_AUD");
    }
    if (requireCloudflareAccess && !cloudflareAccessIssuer && !cloudflareTeamDomain) {
      missing.push("AI_LINK_CLOUDFLARE_TEAM_DOMAIN or AI_LINK_CLOUDFLARE_ACCESS_ISSUER");
    }
    if (
      requireCloudflareAccess
      && allowedAccessEmails.length === 0
      && !allowCloudflareServiceTokens
    ) {
      missing.push("AI_LINK_ALLOWED_ACCESS_EMAILS or AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN");
    }
    if (missing.length > 0) {
      throw new Error(`Missing required production secrets: ${missing.join(", ")}`);
    }
  }

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT || 10000),
    baseUrl,
    databaseUrl: env.DATABASE_URL || "",
    appPassword,
    sessionSecret,
    sessionMaxAgeSeconds: boundedInteger(
      env.AI_LINK_SESSION_MAX_AGE_SECONDS,
      28800,
      300,
      86400
    ),
    leaseMs: Number(env.AI_LINK_LEASE_MS || 120000),
    executorHeartbeatTtlMs: boundedInteger(
      env.AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS,
      60000,
      15000,
      600000
    ),
    connectorProbeTtlMs: boundedInteger(
      env.AI_LINK_CONNECTOR_PROBE_TTL_MS,
      900000,
      60000,
      86400000
    ),
    retention: {
      artifactDays: Number(env.AI_LINK_ARTIFACT_RETENTION_DAYS || 7),
      auditDays: Number(env.AI_LINK_AUDIT_RETENTION_DAYS || 180)
    },
    access: {
      requireCloudflareAccess,
      allowedEmails: allowedAccessEmails,
      allowServiceTokens: allowCloudflareServiceTokens,
      audience: cloudflareAccessAudience,
      issuer: cloudflareAccessIssuer,
      teamDomain: cloudflareTeamDomain
    },
    email: {
      smtpUrl: env.SMTP_URL || "",
      to: env.APPROVAL_EMAIL_TO || "",
      from: env.APPROVAL_EMAIL_FROM || "AI Link <no-reply@localhost>"
    },
    apiTokens: [
      {
        name: "admin",
        token: adminToken,
        scopes: [
          "tasks:create",
          "tasks:read",
          "tasks:approve",
          "connectors:read",
          "audit:read",
          "audit:write"
        ]
      },
      {
        name: "executor",
        token: executorToken,
        executorId,
        scopes: ["executor:lease", "executor:result", "executor:heartbeat", "audit:write"]
      },
      {
        name: "codex",
        token: codexToken,
        scopes: readCsv(env.AI_LINK_CODEX_SCOPES).length
          ? readCsv(env.AI_LINK_CODEX_SCOPES)
          : ["tasks:create", "tasks:read", "connectors:read", "audit:write"]
      }
    ].filter((item) => item.token)
  };
}
