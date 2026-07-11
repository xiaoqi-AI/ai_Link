import crypto from "node:crypto";

function digest(text) {
  return crypto.createHash("sha256").update(text || "").digest("hex").slice(0, 12);
}

export class MockWechatConnector {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.mode = "mock";
  }

  async checkHealth() {
    return {
      schema_version: "1",
      platform: "wechat_official",
      operation: "check_health",
      status: "ready",
      session: {
        state: "not_required",
        checked_at: this.clock().toISOString()
      },
      items: [],
      action_required: null,
      diagnostics: {
        item_count: 0
      }
    };
  }

  async readContent(input) {
    const title = input.title || "Mock 微信素材";
    const text = input.text || `来自 ${input.url || "手动输入"} 的模拟正文。`;
    return {
      platform: "wechat_official",
      title,
      sourceUrl: input.url || "",
      excerpt: text.slice(0, 120),
      text,
      fetchedAt: this.clock().toISOString()
    };
  }

  async createDraft(article, detection) {
    return {
      platform: "wechat_official",
      draftId: `draft_${digest(`${article.title}:${article.text}`)}`,
      title: article.title,
      digest: article.excerpt || article.text.slice(0, 80),
      detectionSummary: detection.summary,
      createdAt: this.clock().toISOString()
    };
  }

  async publish(draftId) {
    return {
      platform: "wechat_official",
      draftId,
      publishId: `publish_${digest(draftId)}`,
      publishedAt: this.clock().toISOString()
    };
  }

  async metrics(publishId) {
    return {
      platform: "wechat_official",
      publishId,
      status: "waiting_metrics",
      summary: "发布后指标需要平台产生数据后再回收。"
    };
  }
}
