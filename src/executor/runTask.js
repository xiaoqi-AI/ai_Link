import { createConnectorRegistry } from "../connectors/registry.js";
import { redact } from "../security/redact.js";

const ACTION_REQUIRED_CODES = new Set([
  "captcha_required",
  "login_expired",
  "manual_action_required",
  "platform_rate_limited",
  "rate_limited",
  "session_expired",
  "verification_required"
]);

function approvalTitle(task) {
  if (task.currentStep === "publish") return "确认正式发布";
  return "确认继续";
}

export async function runTask(task, { registry = createConnectorRegistry() } = {}) {
  try {
    return await runTaskInner(task, { registry });
  } catch (error) {
    return resultFromError(error);
  }
}

async function runTaskInner(task, { registry }) {
  if (task.workflow === "gsc_monitor") {
    return runGscMonitorTask(task, registry);
  }

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

async function runGscMonitorTask(task, registry) {
  const connector = registry.google_search_console;
  if (!connector || typeof connector.monitorSite !== "function") {
    throw Object.assign(new Error("Google Search Console connector is not available."), {
      code: "connector_missing",
      platform: "google_search_console",
      retryable: false
    });
  }
  const monitor = await connector.monitorSite(task.input || {});
  const result = redact(monitor);
  const artifacts = [
    {
      kind: "gsc-status-report",
      title: "GSC 自动检查报告",
      summary: monitor.summary.conclusion,
      content: {
        reportMarkdown: monitor.reportMarkdown,
        checkedAt: monitor.checkedAt,
        nextCheckAt: monitor.nextCheckAt,
        counts: monitor.summary.counts
      }
    }
  ];
  if (monitor.summary.requiresManualAction) {
    return {
      status: "needs_action",
      summary: monitor.summary.conclusion,
      error: {
        code: "manual_action_required",
        platform: "google_search_console",
        action: "Review the GSC status report and complete the listed manual checks.",
        retryable: true
      },
      result,
      artifacts
    };
  }
  return {
    status: "completed",
    summary: monitor.summary.conclusion,
    result,
    artifacts
  };
}

function resultFromError(error) {
  const code = String(error?.code || "executor_error");
  const message = error?.message || "Executor failed while running the task.";
  const common = {
    code,
    message,
    platform: error?.platform || "",
    action: error?.action || "",
    retryable: error?.retryable !== false
  };

  if (error?.needsAction || ACTION_REQUIRED_CODES.has(code)) {
    return {
      status: "needs_action",
      summary: message,
      error: redact(common),
      result: redact(error?.result || {}),
      artifacts: []
    };
  }

  return {
    status: "failed",
    error: redact({
      ...common,
      retryable: false
    })
  };
}
