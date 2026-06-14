import { MockWechatConnector } from "./mockWechat.js";
import { MockZhuqueConnector } from "./mockZhuque.js";

export function createConnectorRegistry({ mode = "mock" } = {}) {
  if (mode !== "mock") {
    throw new Error("Only mock connectors are enabled in the public MVP. Real connectors must live behind private configuration.");
  }

  return {
    wechat_official: new MockWechatConnector(),
    zhuque_ai: new MockZhuqueConnector(),
    douyin: { status: "reserved" },
    xiaohongshu: { status: "reserved" },
    zhihu: { status: "reserved" },
    toutiao: { status: "reserved" }
  };
}
