export const CONNECTOR_METHODS = Object.freeze({
  check_health: "checkHealth",
  check_session: "checkSession",
  begin_login: "beginLogin",
  complete_login: "completeLogin",
  logout: "logout",
  read_content: "readContent",
  detect: "detectText",
  create_draft: "createDraft",
  publish: "publish",
  metrics: "metrics",
  check_auth: "checkAuth",
  list_sites: "listSites",
  inspect_url: "inspectUrl",
  list_sitemaps: "listSitemaps",
  submit_sitemap: "submitSitemap",
  check_public_crawlability: "checkPublicCrawlability",
  generate_status_report: "generateStatusReport"
});

export const PLATFORM_CONTRACTS = Object.freeze({
  wechat_official: ["check_health", "read_content", "create_draft", "publish", "metrics"],
  zhuque_ai: ["detect"],
  google_search_console: [
    "list_sites",
    "inspect_url",
    "list_sitemaps",
    "submit_sitemap",
    "check_public_crawlability",
    "generate_status_report"
  ],
  github: ["check_auth"],
  douyin: ["read_content", "create_draft", "publish", "metrics"],
  xiaohongshu: ["check_session", "begin_login", "complete_login", "logout", "read_content"],
  zhihu: ["read_content", "create_draft", "publish", "metrics"],
  toutiao: ["read_content", "create_draft", "publish", "metrics"]
});

export const PLATFORM_REQUIRED_CAPABILITIES = Object.freeze({
  wechat_official: ["check_health", "read_content", "create_draft"],
  zhuque_ai: ["detect"],
  google_search_console: [
    "list_sites",
    "inspect_url",
    "list_sitemaps",
    "submit_sitemap",
    "check_public_crawlability",
    "generate_status_report"
  ],
  github: ["check_auth"],
  douyin: ["read_content", "create_draft", "publish", "metrics"],
  xiaohongshu: ["check_session", "begin_login", "read_content"],
  zhihu: ["read_content", "create_draft", "publish", "metrics"],
  toutiao: ["read_content", "create_draft", "publish", "metrics"]
});

const PUBLIC_CONNECTOR_MODES = new Set([
  "mock",
  "private",
  "reserved",
  "public-check+mock-google-api",
  "private-api-client+public-check"
]);

export function describeConnectorRegistry(registry) {
  const issues = validateConnectorRegistry(registry);
  const connectors = Object.entries(PLATFORM_CONTRACTS).map(([platform, capabilities]) => {
    const connector = registry[platform];
    const platformIssues = issues.filter((issue) => issue.platform === platform);
    const reserved = connector?.status === "reserved";
    const hasError = platformIssues.some((issue) => issue.severity === "error");

    return {
      platform,
      status: reserved ? "reserved" : (!connector || hasError ? "misconfigured" : "available"),
      mode: publicConnectorMode(connector, reserved),
      capabilities: capabilities.map((capability) => ({
        name: capability,
        method: CONNECTOR_METHODS[capability],
        available: hasCapability(connector, capability),
        required: PLATFORM_REQUIRED_CAPABILITIES[platform].includes(capability),
        mode: connector?.capabilityModes?.[capability]
          || (reserved ? "reserved" : publicConnectorMode(connector, false))
      })),
      issues: platformIssues
    };
  });

  return {
    connectors,
    issues
  };
}

export function validateConnectorRegistry(registry) {
  const issues = [];

  for (const platform of Object.keys(PLATFORM_CONTRACTS)) {
    const capabilities = PLATFORM_REQUIRED_CAPABILITIES[platform];
    const connector = registry[platform];
    if (!connector) {
      issues.push({
        platform,
        severity: "error",
        code: "connector_missing",
        message: `${platform} connector is not registered.`
      });
      continue;
    }

    if (connector.status === "reserved") {
      continue;
    }

    for (const capability of capabilities) {
      if (!hasCapability(connector, capability)) {
        issues.push({
          platform,
          severity: "error",
          code: "connector_contract_failed",
          reason: "capability_missing",
          capability,
          method: CONNECTOR_METHODS[capability],
          message: `${platform} must implement ${CONNECTOR_METHODS[capability]} for ${capability}.`
        });
      }
    }
  }

  return issues;
}

function hasCapability(connector, capability) {
  return typeof connector?.[CONNECTOR_METHODS[capability]] === "function";
}

function publicConnectorMode(connector, reserved) {
  if (reserved) return "reserved";
  return PUBLIC_CONNECTOR_MODES.has(connector?.mode) ? connector.mode : "mock";
}
