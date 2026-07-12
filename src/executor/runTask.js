import { createConnectorRegistry } from "../connectors/registry.js";
import {
  getPlatformAuthOperation,
  normalizePlatformConnectorResult,
  publicIssueForCode
} from "../connectors/platformAuthContracts.js";
import { redact } from "../security/redact.js";

const ACTION_REQUIRED_CODES = new Set([
  "captcha_required",
  "credential_invalid",
  "credential_missing",
  "login_required",
  "login_expired",
  "manual_action_required",
  "official_api_ip_not_whitelisted",
  "official_api_rate_limited",
  "platform_rate_limited",
  "rate_limited",
  "session_expired",
  "verification_required"
]);

const SAFE_PLATFORMS = new Set([
  "wechat_official",
  "zhuque_ai",
  "google_search_console",
  "douyin",
  "xiaohongshu",
  "zhihu",
  "toutiao"
]);

const SAFE_ERROR_MESSAGES = Object.freeze({
  captcha_required: "需要在本机浏览器完成人机验证。",
  credential_invalid: "公众号官方 API 凭据无效，需要重新配置。",
  credential_missing: "公众号官方 API 凭据尚未配置。",
  login_required: "平台尚未登录，需要在本机浏览器完成登录。",
  login_expired: "平台登录已过期，需要在本机浏览器续登。",
  manual_action_required: "任务需要人工处理后重试。",
  official_api_ip_not_whitelisted: "当前执行器出口 IP 未加入公众号 API 白名单。",
  official_api_rate_limited: "公众号官方 API 当前限流，需要稍后重试。",
  official_api_unavailable: "公众号官方 API 当前不可用，需要稍后重试。",
  platform_rate_limited: "平台当前限流，需要按退避时间重试。",
  rate_limited: "外部服务当前限流，需要稍后重试。",
  session_expired: "平台登录已过期，需要在本机浏览器续登。",
  verification_required: "需要在本机浏览器完成人工验证。",
  connector_missing: "本机尚未安装或启用对应的私有连接器。",
  connector_contract_failed: "私有连接器未通过公开结果合同校验。",
  specific_content_missing: "本次没有取得可验证的具体内容链接。",
  source_unreachable: "本次取得的具体内容链接无法验证可达。",
  executor_error: "本地执行器处理任务失败。"
});

const PLATFORM_INTERACTIVE_LOGIN_STEP = "platform_interactive_login";

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
  if (task.workflow === "platform_auth_collect") {
    return runPlatformAuthTask(task, registry);
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

async function runPlatformAuthTask(task, registry) {
  const { platform, operation, ...operationInput } = task.input || {};
  const operationContract = getPlatformAuthOperation(platform, operation);
  const connector = registry[platform];

  if (!operationContract) {
    return platformTaskResult(syntheticPlatformResult({
      platform,
      operation,
      code: "connector_contract_failed"
    }));
  }
  if (!connector || connector.status === "reserved") {
    return platformTaskResult(syntheticPlatformResult({ platform, operation, code: "connector_missing" }));
  }

  const method = connector[operationContract.method];
  if (typeof method !== "function") {
    return platformTaskResult(syntheticPlatformResult({
      platform,
      operation,
      code: "connector_contract_failed"
    }));
  }
  if (operationContract.mode === "interactive" && task.currentStep !== PLATFORM_INTERACTIVE_LOGIN_STEP) {
    return platformInteractionApproval({ platform, operation });
  }
  if (!["read_only", "interactive"].includes(operationContract.mode)) {
    return platformTaskResult(syntheticPlatformResult({
      platform,
      operation,
      code: "login_required"
    }));
  }

  let rawResult;
  try {
    rawResult = await method.call(connector, operationInput);
  } catch (error) {
    const code = String(error?.code || "");
    if (publicIssueForCode(code)) {
      return platformTaskResult(syntheticPlatformResult({ platform, operation, code }));
    }
    throw error;
  }

  let normalized;
  try {
    normalized = normalizePlatformConnectorResult(rawResult, { platform, operation });
  } catch (error) {
    if (error?.code === "connector_contract_failed") {
      normalized = syntheticPlatformResult({
        platform,
        operation,
        code: "connector_contract_failed"
      });
    } else {
      throw error;
    }
  }

  return platformTaskResult(normalized);
}

function platformInteractionApproval({ platform, operation }) {
  const summary = "需要人工批准后，才会在本机执行交互式平台登录。";
  return {
    status: "needs_approval",
    summary,
    approval: {
      type: "platform_interactive_login",
      title: "确认本机交互登录",
      summary: "批准后，本机执行器可以调用受信任私有连接器的交互登录流程。该批准不会保存 Cookie、二维码、账号详情或原始平台响应。",
      nextStep: PLATFORM_INTERACTIVE_LOGIN_STEP
    },
    result: redact({
      schema_version: "1",
      platform,
      operation,
      approval_required: {
        code: "interactive_approval_required",
        action: "approve_platform_interactive_login",
        retryable: false
      },
      diagnostics: {
        issue_codes: ["interactive_approval_required"]
      }
    }),
    artifacts: []
  };
}

function platformTaskResult(normalized) {
  const result = redact(normalized);
  const summary = platformResultSummary(normalized);

  if (normalized.status === "needs_action") {
    return {
      status: "needs_action",
      summary,
      error: {
        code: normalized.action_required.code,
        platform: normalized.platform,
        action: normalized.action_required.action,
        retryable: normalized.action_required.retryable,
        message: summary
      },
      result,
      artifacts: []
    };
  }

  if (normalized.status === "blocked") {
    return {
      status: "failed",
      summary,
      error: {
        code: normalized.action_required.code,
        platform: normalized.platform,
        action: normalized.action_required.action,
        retryable: normalized.action_required.retryable,
        message: summary
      },
      result,
      artifacts: []
    };
  }

  return {
    status: "completed",
    summary,
    result,
    artifacts: []
  };
}

function syntheticPlatformResult({ platform, operation, code }) {
  const status = ACTION_REQUIRED_CODES.has(code) ? "needs_action" : "blocked";
  return normalizePlatformConnectorResult({
    status,
    session: {
      state: sessionStateForCode(code, platform),
      checked_at: new Date().toISOString()
    },
    items: [],
    action_required: { code },
    diagnostics: {
      item_count: 0,
      issue_codes: [code]
    }
  }, { platform, operation });
}

function sessionStateForCode(code, platform) {
  if (code === "login_required") return "missing";
  if (code === "login_expired") return "expired";
  if (["captcha_required", "verification_required"].includes(code)) return "verification_required";
  if (["connector_missing", "connector_contract_failed"].includes(code)) return "blocked";
  return platform === "wechat_official" ? "not_required" : "valid";
}

function platformResultSummary(result) {
  if (result.status === "ready") {
    if (result.operation === "search_content") {
      return `小红书只读采集完成，取得 ${result.diagnostics.item_count} 条已验证具体链接。`;
    }
    if (result.operation === "check_health") {
      return "公众号官方 API 健康检查通过。";
    }
    return "平台会话检查通过。";
  }
  return SAFE_ERROR_MESSAGES[result.action_required?.code] || "平台连接器返回了需要处理的状态。";
}

function resultFromError(error) {
  const code = String(error?.code || "executor_error");
  const issue = publicIssueForCode(code);
  const message = SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.executor_error;
  const common = {
    code,
    message,
    platform: SAFE_PLATFORMS.has(error?.platform) ? error.platform : "",
    action: issue?.action || "",
    retryable: issue?.retryable ?? ACTION_REQUIRED_CODES.has(code)
  };

  if (error?.needsAction || ACTION_REQUIRED_CODES.has(code)) {
    return {
      status: "needs_action",
      summary: message,
      error: redact(common),
      result: {},
      artifacts: []
    };
  }

  return {
    status: "failed",
    error: redact({
      ...common
    }),
    result: {}
  };
}
