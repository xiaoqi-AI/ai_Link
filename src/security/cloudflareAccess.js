import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksByIssuer = new Map();

function forbidden(req, res, detail) {
  if (req.path.startsWith("/api")) {
    res.status(403).json({ error: "cloudflare_access_required", detail });
    return;
  }
  res.status(403).send("Cloudflare Access verification required.");
}

function normalizeIssuer(accessConfig) {
  if (accessConfig.issuer) {
    return accessConfig.issuer.replace(/\/+$/, "");
  }
  if (!accessConfig.teamDomain) {
    return "";
  }
  const domain = accessConfig.teamDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${domain}`;
}

function jwksForIssuer(issuer) {
  if (!jwksByIssuer.has(issuer)) {
    jwksByIssuer.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
    );
  }
  return jwksByIssuer.get(issuer);
}

async function verifyAccessJwt(assertion, accessConfig) {
  const issuer = normalizeIssuer(accessConfig);
  if (!issuer || !accessConfig.audience) {
    return { verified: false, payload: null, reason: "jwt_validation_not_configured" };
  }

  const verified = await jwtVerify(assertion, jwksForIssuer(issuer), {
    audience: accessConfig.audience,
    issuer,
    algorithms: ["RS256"]
  });
  return { verified: true, payload: verified.payload, reason: "" };
}

export function requireCloudflareAccess(config) {
  return async (req, res, next) => {
    if (!config.access?.requireCloudflareAccess) {
      next();
      return;
    }

    const forwardedEmail = normalizeIdentity(req.get("cf-access-authenticated-user-email"));
    const assertion = String(req.get("cf-access-jwt-assertion") || "").trim();

    if (!assertion) {
      forbidden(req, res, "missing_cloudflare_access_headers");
      return;
    }

    let verification = null;
    try {
      verification = await verifyAccessJwt(assertion, config.access);
    } catch {
      forbidden(req, res, "invalid_cloudflare_access_jwt");
      return;
    }
    if (!verification.verified || !verification.payload) {
      forbidden(req, res, verification.reason || "invalid_cloudflare_access_jwt");
      return;
    }

    const verifiedPayload = verification.payload;
    if (verifiedPayload.type !== "app") {
      forbidden(req, res, "invalid_cloudflare_access_token_type");
      return;
    }

    const payloadEmail = normalizeIdentity(verifiedPayload.email);
    const serviceCommonName = normalizeIdentity(verifiedPayload.common_name);
    if (forwardedEmail && forwardedEmail !== payloadEmail) {
      forbidden(req, res, "cloudflare_access_identity_mismatch");
      return;
    }

    let email = payloadEmail;
    let isServiceToken = false;
    if (!email && serviceCommonName) {
      if (forwardedEmail) {
        forbidden(req, res, "cloudflare_access_identity_mismatch");
        return;
      }
      if (!config.access.allowServiceTokens) {
        forbidden(req, res, "service_token_not_allowed");
        return;
      }
      isServiceToken = true;
    }
    if (!email && !isServiceToken) {
      forbidden(req, res, "verified_cloudflare_access_identity_missing");
      return;
    }

    const allowedEmails = config.access.allowedEmails || [];
    if (allowedEmails.length > 0 && !isServiceToken && !allowedEmails.includes(email)) {
      forbidden(req, res, "email_not_allowed");
      return;
    }

    req.cloudflareAccess = {
      email,
      serviceToken: isServiceToken,
      jwtVerified: true
    };
    next();
  };
}

function normalizeIdentity(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.length <= 320 ? normalized : "";
}
