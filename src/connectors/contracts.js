export const CONNECTOR_METHODS = Object.freeze({
  read_content: "readContent",
  detect: "detectText",
  create_draft: "createDraft",
  publish: "publish",
  metrics: "metrics"
});

export const PLATFORM_CONTRACTS = Object.freeze({
  wechat_official: ["read_content", "create_draft", "publish", "metrics"],
  zhuque_ai: ["detect"],
  douyin: ["read_content", "create_draft", "publish", "metrics"],
  xiaohongshu: ["read_content", "create_draft", "publish", "metrics"],
  zhihu: ["read_content", "create_draft", "publish", "metrics"],
  toutiao: ["read_content", "create_draft", "publish", "metrics"]
});

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
      capabilities: capabilities.map((capability) => ({
        name: capability,
        method: CONNECTOR_METHODS[capability],
        available: hasCapability(connector, capability)
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

  for (const [platform, capabilities] of Object.entries(PLATFORM_CONTRACTS)) {
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
          code: "capability_missing",
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
