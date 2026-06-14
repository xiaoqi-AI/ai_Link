import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeConnectorRegistry, validateConnectorRegistry } from "../src/connectors/contracts.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";

describe("connector contracts", () => {
  it("describes public mock and reserved connectors without exposing implementation details", () => {
    const summary = describeConnectorRegistry(createConnectorRegistry());
    const wechat = summary.connectors.find((connector) => connector.platform === "wechat_official");
    const douyin = summary.connectors.find((connector) => connector.platform === "douyin");

    assert.equal(summary.issues.length, 0);
    assert.equal(wechat.status, "available");
    assert.equal(wechat.capabilities.find((capability) => capability.name === "publish").available, true);
    assert.equal(douyin.status, "reserved");
    assert.equal(douyin.capabilities.find((capability) => capability.name === "publish").available, false);
    assert.equal(typeof wechat.readContent, "undefined");
  });

  it("reports misconfigured connectors before a real platform adapter is enabled", () => {
    const issues = validateConnectorRegistry({
      wechat_official: { status: "reserved" },
      zhuque_ai: { detectText: async () => ({}) },
      douyin: { readContent: async () => ({}) },
      xiaohongshu: { status: "reserved" },
      zhihu: { status: "reserved" },
      toutiao: { status: "reserved" }
    });

    assert.equal(issues.some((issue) => issue.platform === "douyin" && issue.code === "capability_missing"), true);
  });
});
