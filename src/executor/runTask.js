import { createConnectorRegistry } from "../connectors/registry.js";
import { redact } from "../security/redact.js";

function approvalTitle(task) {
  if (task.currentStep === "publish") return "确认正式发布";
  return "确认继续";
}

export async function runTask(task, { registry = createConnectorRegistry() } = {}) {
  if (task.currentStep === "publish") {
    const draftId = task.result?.draft?.draftId;
    if (!draftId) {
      return {
        status: "failed",
        error: {
          code: "missing_draft_id",
          message: "Cannot publish without an approved draft id."
        }
      };
    }
    const published = await registry.wechat_official.publish(draftId);
    const metrics = await registry.wechat_official.metrics(published.publishId);
    return {
      status: "completed",
      summary: "已模拟完成发布，并进入指标回收等待状态。",
      result: redact({
        draft: task.result.draft,
        published,
        metrics
      }),
      artifacts: [
        {
          kind: "publish-summary",
          title: "发布摘要",
          summary: `模拟发布 ID：${published.publishId}`,
          content: { published, metrics }
        }
      ]
    };
  }

  const article = await registry.wechat_official.readContent(task.input || {});
  const detection = await registry.zhuque_ai.detectText(article);
  const draft = await registry.wechat_official.createDraft(article, detection);
  const summary = [
    `已模拟读取素材《${article.title}》。`,
    detection.summary,
    "已生成公众号草稿，等待人工确认后才会继续发布。"
  ].join(" ");

  if (task.workflow === "read_detect") {
    return {
      status: "completed",
      summary: `已完成模拟取材和朱雀检测：${detection.summary}`,
      result: redact({ article, detection }),
      artifacts: [
        {
          kind: "detection-summary",
          title: "朱雀检测摘要",
          summary: detection.summary,
          content: detection
        }
      ]
    };
  }

  return {
    status: "needs_approval",
    summary,
    result: redact({
      article: {
        platform: article.platform,
        title: article.title,
        sourceUrl: article.sourceUrl,
        excerpt: article.excerpt,
        fetchedAt: article.fetchedAt
      },
      detection,
      draft
    }),
    artifacts: [
      {
        kind: "draft-summary",
        title: "公众号草稿摘要",
        summary: `草稿 ${draft.draftId} 已准备好，等待确认发布。`,
        content: { draft, detection }
      }
    ],
    approval: {
      type: "publish",
      title: approvalTitle(task),
      summary: `确认后将继续发布草稿：${draft.title}`,
      nextStep: "publish"
    }
  };
}
