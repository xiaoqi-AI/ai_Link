const ACTION_REQUIRED_CODES = new Set([
  "login_required",
  "login_expired",
  "session_expired",
  "captcha_required",
  "verification_required",
  "credential_missing",
  "credential_invalid",
  "interactive_approval_required",
  "official_api_ip_not_whitelisted",
  "official_api_rate_limited",
  "official_api_unavailable",
  "connector_contract_failed"
]);

const ACTION_LABELS = Object.freeze({
  login_required: "需要本机登录",
  login_expired: "需要续登",
  session_expired: "需要续登",
  captcha_required: "需要验证码",
  verification_required: "需要人工验证",
  credential_missing: "需要配置凭据",
  credential_invalid: "需要更换凭据",
  interactive_approval_required: "需要批准本机交互登录",
  official_api_ip_not_whitelisted: "需要配置 IP 白名单",
  official_api_rate_limited: "公众号 API 正在限流",
  official_api_unavailable: "公众号 API 暂不可用",
  connector_contract_failed: "需要修复私有连接器"
});

const ACTION_OWNERS = Object.freeze({
  login_required: "account_owner",
  login_expired: "account_owner",
  session_expired: "account_owner",
  captcha_required: "account_owner",
  verification_required: "account_owner",
  interactive_approval_required: "maintainer",
  credential_missing: "secret_owner",
  credential_invalid: "secret_owner",
  official_api_ip_not_whitelisted: "platform_admin",
  official_api_rate_limited: "maintainer",
  official_api_unavailable: "maintainer",
  connector_contract_failed: "connector_maintainer"
});

const ACTION_RUNBOOKS = Object.freeze({
  login_required: "在受信任本机完成平台登录后重试关联任务。",
  login_expired: "在受信任本机完成平台续登后重试关联任务。",
  session_expired: "在受信任本机刷新平台会话后重试关联任务。",
  captcha_required: "在受信任本机完成人机验证后重试关联任务。",
  verification_required: "在受信任本机完成平台人工验证后重试关联任务。",
  interactive_approval_required: "先由维护者审批本机交互登录，再让本地执行器继续。",
  credential_missing: "补齐对应平台的本机或密钥管理器凭据后重试。",
  credential_invalid: "轮换对应平台凭据并确认最小权限后重试。",
  official_api_ip_not_whitelisted: "把当前执行器出口 IP 加入官方平台白名单后重试。",
  official_api_rate_limited: "等待公众号 API 退避时间结束后重试，不要通过更换凭据绕过配额。",
  official_api_unavailable: "确认网络和公众号官方服务恢复后重试；不要在故障期间反复调用。",
  connector_contract_failed: "修复私有连接器合同输出，确认不回传 Cookie、token、账号详情或原始响应。"
});

const ACTION_SEVERITY = Object.freeze({
  interactive_approval_required: "approval",
  connector_contract_failed: "blocked",
  credential_missing: "blocked",
  credential_invalid: "blocked",
  official_api_ip_not_whitelisted: "blocked"
});

export function summarizeConnectorAuthStatus({ connectors = [], actionTasks = [] } = {}) {
  const actionByPlatform = groupActionTasksByPlatform(actionTasks);
  const items = connectors.map((connector) => {
    const platformActions = actionByPlatform.get(connector.platform) || [];
    const firstAction = platformActions[0];
    const issueCodes = connector.issues?.map((issue) => issue.code).filter(Boolean) || [];

    if (firstAction) {
      return authItem({
        connector,
        status: "needs_action",
        reason: firstAction.code,
        action: actionLabel(firstAction.code),
        relatedTaskIds: platformActions.map((item) => item.taskId)
      });
    }

    if (connector.status === "available") {
      return authItem({
        connector,
        status: "ready",
        reason: connector.mode || "available",
        action: "无需处理"
      });
    }

    if (connector.status === "reserved") {
      return authItem({
        connector,
        status: "reserved",
        reason: "reserved",
        action: "暂未接入真实账号"
      });
    }

    return authItem({
      connector,
      status: "blocked",
      reason: issueCodes[0] || connector.status || "unknown",
      action: "需要维护者处理"
    });
  });

  const nextActions = buildNextActions(items);

  return {
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      needs_action: items.filter((item) => item.status === "needs_action").length,
      reserved: items.filter((item) => item.status === "reserved").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      next_actions: nextActions.length
    },
    items,
    nextActions
  };
}

function authItem({ connector, status, reason, action, relatedTaskIds = [] }) {
  return {
    platform: connector.platform,
    status,
    connectorStatus: connector.status,
    mode: connector.mode,
    reason,
    action,
    relatedTaskIds: relatedTaskIds.slice(0, 5)
  };
}

function groupActionTasksByPlatform(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const code = actionCode(task);
    if (!ACTION_REQUIRED_CODES.has(code)) {
      continue;
    }
    const platform = actionPlatform(task);
    if (!platform) {
      continue;
    }
    const values = groups.get(platform) || [];
    values.push({
      taskId: task.id,
      code
    });
    groups.set(platform, values);
  }
  return groups;
}

function actionCode(task) {
  if (task?.status === "approval_required") {
    return String(
      task?.result?.approval_required?.code
      || task?.result?.approval?.code
      || "interactive_approval_required"
    );
  }
  return String(
    task?.error?.code
    || task?.result?.action_required?.code
    || task?.result?.approval_required?.code
    || task?.result?.error?.code
    || task?.error?.message
    || ""
  );
}

function actionPlatform(task) {
  return String(
    task?.error?.platform
    || task?.result?.platform
    || task?.input?.platform
    || task?.targets?.[0]
    || ""
  );
}

function actionLabel(code) {
  return ACTION_LABELS[code] || "需要人工处理";
}

function buildNextActions(items) {
  return items
    .filter((item) => item.status === "needs_action" || item.status === "blocked")
    .map((item) => ({
      platform: item.platform,
      status: item.status,
      reason: item.reason,
      title: actionLabel(item.reason),
      owner: ACTION_OWNERS[item.reason] || "maintainer",
      severity: actionSeverity(item),
      runbook: ACTION_RUNBOOKS[item.reason] || "查看关联任务详情，按公开错误码处理后重试。",
      relatedTaskIds: item.relatedTaskIds.slice(0, 5),
      retryAfterAction: item.status === "needs_action" && item.reason !== "interactive_approval_required"
    }))
    .sort((a, b) => actionRank(a) - actionRank(b));
}

function actionSeverity(item) {
  if (item.status === "blocked") {
    return "blocked";
  }
  return ACTION_SEVERITY[item.reason] || "manual";
}

function actionRank(action) {
  const ranks = {
    approval: 10,
    manual: 20,
    blocked: 30
  };
  return ranks[action.severity] || 40;
}
