const ACTION_REQUIRED_CODES = new Set([
  "login_required",
  "login_expired",
  "session_expired",
  "captcha_required",
  "verification_required",
  "credential_missing",
  "credential_invalid",
  "official_api_ip_not_whitelisted",
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
  official_api_ip_not_whitelisted: "需要配置 IP 白名单",
  connector_contract_failed: "需要修复私有连接器"
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

  return {
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      needs_action: items.filter((item) => item.status === "needs_action").length,
      reserved: items.filter((item) => item.status === "reserved").length,
      blocked: items.filter((item) => item.status === "blocked").length
    },
    items
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
  return String(
    task?.error?.code
    || task?.result?.action_required?.code
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
