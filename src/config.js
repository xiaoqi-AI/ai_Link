import crypto from "node:crypto";

function readCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
  const codexToken = env.AI_LINK_CODEX_TOKEN || (isProduction ? "" : "dev-codex-token");

  if (isProduction) {
    const missing = [];
    if (!appPassword) missing.push("AI_LINK_APP_PASSWORD");
    if (!sessionSecret) missing.push("AI_LINK_SESSION_SECRET");
    if (!adminToken) missing.push("AI_LINK_ADMIN_TOKEN");
    if (!executorToken) missing.push("AI_LINK_EXECUTOR_TOKEN");
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
    leaseMs: Number(env.AI_LINK_LEASE_MS || 120000),
    retention: {
      artifactDays: Number(env.AI_LINK_ARTIFACT_RETENTION_DAYS || 7),
      auditDays: Number(env.AI_LINK_AUDIT_RETENTION_DAYS || 180)
    },
    access: {
      requireCloudflareAccess: ["1", "true", "yes"].includes(String(env.AI_LINK_REQUIRE_CLOUDFLARE_ACCESS || "").toLowerCase()),
      allowedEmails: readCsv(env.AI_LINK_ALLOWED_ACCESS_EMAILS).map((item) => item.toLowerCase()),
      allowServiceTokens: ["1", "true", "yes"].includes(String(env.AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN || "").toLowerCase()),
      audience: env.AI_LINK_CLOUDFLARE_ACCESS_AUD || "",
      issuer: env.AI_LINK_CLOUDFLARE_ACCESS_ISSUER || "",
      teamDomain: env.AI_LINK_CLOUDFLARE_TEAM_DOMAIN || ""
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
          "audit:read"
        ]
      },
      {
        name: "executor",
        token: executorToken,
        scopes: ["executor:lease", "executor:result"]
      },
      {
        name: "codex",
        token: codexToken,
        scopes: readCsv(env.AI_LINK_CODEX_SCOPES).length
          ? readCsv(env.AI_LINK_CODEX_SCOPES)
          : ["tasks:create", "tasks:read", "connectors:read"]
      }
    ].filter((item) => item.token)
  };
}
