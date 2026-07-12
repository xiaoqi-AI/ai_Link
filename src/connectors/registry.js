import { MockWechatConnector } from "./mockWechat.js";
import { MockZhuqueConnector } from "./mockZhuque.js";
import { MockGitHubConnector } from "./mockGitHub.js";
import { GoogleSearchConsoleConnector } from "./googleSearchConsole.js";
import { describeConnectorRegistry, PLATFORM_CONTRACTS } from "./contracts.js";

export function createConnectorRegistry({ mode = "mock", privateConnectors = {} } = {}) {
  if (mode !== "mock") {
    throw new Error("Only mock connectors are enabled in the public MVP. Real connectors must live behind private configuration.");
  }

  assertPrivateConnectorOverrides(privateConnectors);

  return {
    wechat_official: new MockWechatConnector(),
    zhuque_ai: new MockZhuqueConnector(),
    google_search_console: new GoogleSearchConsoleConnector(),
    github: new MockGitHubConnector(),
    douyin: { status: "reserved" },
    xiaohongshu: { status: "reserved" },
    zhihu: { status: "reserved" },
    toutiao: { status: "reserved" },
    ...privateConnectors
  };
}

export function describeConnectors({ registry = createConnectorRegistry() } = {}) {
  return describeConnectorRegistry(registry);
}

function assertPrivateConnectorOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw connectorLoadError("invalid_private_connector_export");
  }

  for (const [platform, connector] of Object.entries(value)) {
    if (!Object.hasOwn(PLATFORM_CONTRACTS, platform) || !connector || typeof connector !== "object") {
      throw connectorLoadError("invalid_private_connector_export");
    }
  }
}

function connectorLoadError(reason) {
  const error = new Error("Private connector configuration is invalid.");
  error.code = "connector_contract_failed";
  error.reason = reason;
  error.retryable = false;
  return error;
}
