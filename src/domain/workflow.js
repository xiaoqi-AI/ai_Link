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
  if (!["full_chain", "read_detect", "draft_only", "metrics", "gsc_monitor"].includes(workflow)) {
    return { error: "unsupported_workflow" };
  }
  const input = body.input || {};
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
