import { getPlatformAuthOperation } from "../connectors/platformAuthContracts.js";

export const TASK_STATUSES = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  ACTION_REQUIRED: "action_required",
  APPROVAL_REQUIRED: "approval_required",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
});

export const APPROVAL_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired"
});

export function validateTaskInput(body) {
  const workflow = body.workflow || "full_chain";
  if (!["full_chain", "read_detect", "draft_only", "metrics", "gsc_monitor", "platform_auth_collect"].includes(workflow)) {
    return { error: "unsupported_workflow" };
  }
  const input = body.input || {};
  if (workflow === "platform_auth_collect") {
    return validatePlatformAuthCollectInput(input, body.options || {});
  }
  if (workflow === "gsc_monitor") {
    if (!input.siteUrl || !Array.isArray(input.urls) || input.urls.length === 0) {
      return { error: "missing_input", detail: "Provide input.siteUrl and at least one input.urls entry." };
    }
    return {
      workflow,
      input,
      targets: body.targets || ["google_search_console"],
      options: body.options || {}
    };
  }
  if (!input.url && !input.text && !input.title) {
    return { error: "missing_input", detail: "Provide input.url, input.text, or input.title." };
  }
  return {
    workflow,
    input,
    targets: body.targets || ["wechat_official", "zhuque_ai"],
    options: body.options || {}
  };
}

function validatePlatformAuthCollectInput(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "missing_input", detail: "Provide a supported platform and operation." };
  }

  const platform = String(input.platform || "");
  const operation = String(input.operation || "");
  if (!getPlatformAuthOperation(platform, operation)) {
    return { error: "unsupported_platform_operation" };
  }

  const normalized = { platform, operation };
  if (platform === "xiaohongshu" && operation === "search_content") {
    const query = String(input.query || "").trim();
    const limit = Number(input.limit ?? 4);
    const sort = String(input.sort || "latest");
    const mode = String(input.mode || "read_only");
    if (!query || query.length > 100) {
      return { error: "invalid_query", detail: "Provide a query between 1 and 100 characters." };
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 4) {
      return { error: "invalid_limit", detail: "Use a limit between 1 and 4." };
    }
    if (sort !== "latest" || mode !== "read_only") {
      return { error: "unsupported_search_mode" };
    }
    Object.assign(normalized, { query, sort, limit, mode });
  }
  if (platform === "github" && operation === "check_auth") {
    const owner = String(input.owner || "").trim();
    const repo = String(input.repo || "").trim();
    const scope = String(input.scope || "repo_read").trim();
    if (owner && !/^[A-Za-z0-9_.-]{1,100}$/.test(owner)) {
      return { error: "invalid_owner", detail: "Use a GitHub owner name with public-safe characters." };
    }
    if (repo && !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
      return { error: "invalid_repo", detail: "Use a GitHub repository name with public-safe characters." };
    }
    if (!["repo_read", "actions_read", "pull_request_read"].includes(scope)) {
      return { error: "unsupported_github_scope" };
    }
    Object.assign(normalized, { owner, repo, scope });
  }

  return {
    workflow: "platform_auth_collect",
    input: normalized,
    targets: [platform],
    options: sanitizePlatformOptions(options)
  };
}

function sanitizePlatformOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return {};
  return {
    requestId: typeof options.requestId === "string" ? options.requestId.slice(0, 120) : ""
  };
}
