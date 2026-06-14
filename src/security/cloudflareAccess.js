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
    issuer
  });
  return { verified: true, payload: verified.payload, reason: "" };
}

export function requireCloudflareAccess(config) {
  return async (req, res, next) => {
    if (!config.access?.requireCloudflareAccess) {
      next();
      return;
    }

    let email = String(req.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
    const assertion = String(req.get("cf-access-jwt-assertion") || "").trim();

    if (!assertion) {
      forbidden(req, res, "missing_cloudflare_access_headers");
      return;
    }

    if (!email && !config.access.allowServiceTokens) {
      forbidden(req, res, "missing_cloudflare_access_email");
      return;
    }

    let verifiedPayload = null;
    try {
      const verification = await verifyAccessJwt(assertion, config.access);
      verifiedPayload = verification.payload;
      if (verification.verified) {
        const payloadEmail = String(verifiedPayload.email || verifiedPayload.common_name || "").trim().toLowerCase();
        if (!email && payloadEmail) {
          email = payloadEmail;
        }
      }
    } catch {
      forbidden(req, res, "invalid_cloudflare_access_jwt");
      return;
    }

    const allowedEmails = config.access.allowedEmails || [];
    const isServiceToken = !email && config.access.allowServiceTokens && Boolean(verifiedPayload);
    if (!email && config.access.allowServiceTokens && !isServiceToken) {
      forbidden(req, res, "service_token_jwt_not_verified");
      return;
    }

    if (allowedEmails.length > 0 && !isServiceToken && !allowedEmails.includes(email)) {
      forbidden(req, res, "email_not_allowed");
      return;
    }

    req.cloudflareAccess = {
      email,
      serviceToken: isServiceToken,
      jwtVerified: Boolean(verifiedPayload)
    };
    next();
  };
}
