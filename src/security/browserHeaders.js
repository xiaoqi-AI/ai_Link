export function browserSecurityHeaders(req, res, next) {
  if (!req.path.startsWith("/api") && req.path !== "/healthz") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
    );
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}
