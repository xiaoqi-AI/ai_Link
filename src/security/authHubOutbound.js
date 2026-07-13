export function validateAuthHubTarget(targetUrl, options = {}) {
  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return { ok: false, attachServiceHeaders: false, detail: "Auth Hub URL is invalid." };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      attachServiceHeaders: false,
      detail: "Auth Hub URL must not contain embedded credentials."
    };
  }

  const hostname = url.hostname.toLowerCase();
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(hostname);
  if (loopback && ["http:", "https:"].includes(url.protocol)) {
    return {
      ok: true,
      attachServiceHeaders: false,
      detail: "Loopback Auth Hub is allowed; Cloudflare Service Auth headers are not attached."
    };
  }

  const explicitlyAllowed = new Set(
    String(options.allowedHosts ?? process.env.AI_LINK_AUTH_HUB_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  if (url.protocol !== "https:" || !explicitlyAllowed.has(hostname)) {
    return {
      ok: false,
      attachServiceHeaders: false,
      detail: "Credentials may only be sent to an explicitly approved HTTPS Auth Hub hostname."
    };
  }

  return {
    ok: true,
    attachServiceHeaders: true,
    detail: "Target is an explicitly approved HTTPS Auth Hub hostname; redirects remain disabled."
  };
}

export function cloudflareServiceHeaders(target, options = {}) {
  const clientId = options.clientId ?? process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.CF_ACCESS_CLIENT_SECRET;
  if (!target?.attachServiceHeaders || !clientId || !clientSecret) return {};
  return {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret
  };
}
