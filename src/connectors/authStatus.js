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
  "platform_rate_limited",
  "platform_unavailable",
  "specific_content_missing",
  "source_unreachable",
  "connector_missing",
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
  platform_rate_limited: "平台正在限流",
  platform_unavailable: "平台只读连接暂不可用",
  specific_content_missing: "需要更具体的搜索词",
  source_unreachable: "平台只读检查不可达",
  connector_missing: "需要安装或启用私有连接器",
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
  platform_rate_limited: "maintainer",
  platform_unavailable: "maintainer",
  specific_content_missing: "task_owner",
  source_unreachable: "maintainer",
  connector_missing: "connector_maintainer",
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
  platform_rate_limited: "等待平台退避时间结束后重试，不要通过切换账号绕过限制。",
  platform_unavailable: "确认本机只读桥、网络和平台服务恢复后重试，不要在故障期间反复调用。",
  specific_content_missing: "换用更具体的只读关键词后低频重试；不要扩大到互动、发布或绕过平台限制。",
  source_unreachable: "确认本机网络、私有连接器和官方平台恢复后重试。",
  connector_missing: "安装或启用已审查的本机私有连接器后重试。",
  connector_contract_failed: "修复私有连接器合同输出，确认不回传 Cookie、token、账号详情或原始响应。"
});

const ACTION_SEVERITY = Object.freeze({
  interactive_approval_required: "approval",
  connector_contract_failed: "blocked",
  credential_missing: "blocked",
  credential_invalid: "blocked",
  connector_missing: "blocked",
  official_api_ip_not_whitelisted: "blocked"
});

export function summarizeConnectorAuthStatus({ connectors = [], actionTasks = [] } = {}) {
  const actionByPlatform = groupActionTasksByPlatform(actionTasks);
  const items = connectors.map((connector) => {
    const platformActions = (actionByPlatform.get(connector.platform) || [])
      .filter((action) => !connector.probe?.checkedAt || !action.updatedAt || action.updatedAt >= connector.probe.checkedAt);
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

    if (connector.runtime?.status === "stale") {
      return authItem({
        connector,
        status: "unverified",
        reason: "executor_heartbeat_stale",
        action: "本机执行器心跳已过期"
      });
    }

    if (connector.probe?.status === "blocked") {
      return authItem({
        connector,
        status: "blocked",
        reason: connector.probe.issueCode || "probe_blocked",
        action: actionLabel(connector.probe.issueCode)
      });
    }

    if (connector.probe?.status === "action_required") {
      return authItem({
        connector,
        status: "needs_action",
        reason: connector.probe.issueCode || "probe_action_required",
        action: actionLabel(connector.probe.issueCode)
      });
    }

    if (connector.probe?.status === "verified" && connector.canRunReal === true) {
      return authItem({
        connector,
        status: "ready",
        reason: "probe_verified",
        action: "无需处理"
      });
    }

    if (connector.probe?.status === "stale") {
      return authItem({
        connector,
        status: "unverified",
        reason: "probe_stale",
        action: "只读探测证据已过期，需要重新执行显式健康检查"
      });
    }

    if (connector.probe?.status === "unverified") {
      return authItem({
        connector,
        status: "unverified",
        reason: connector.probe.issueCode || "probe_unverified",
        action: "探测结果未形成可信证据"
      });
    }

    if (connector.status === "available") {
      const runtimeStatus = connector.runtime?.status || "unreported";
      const reason = runtimeStatus === "online"
        ? (connector.mode === "private" ? "probe_not_run" : "mock_only")
        : "executor_heartbeat_missing";
      return authItem({
        connector,
        status: "unverified",
        reason,
        action: {
          probe_not_run: "能力已加载，尚未完成只读健康检查",
          mock_only: "当前只有 mock/公开契约证据",
          executor_heartbeat_missing: "尚未收到本机执行器心跳"
        }[reason]
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
      unverified: items.filter((item) => item.status === "unverified").length,
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
    source: connector.source || "server_registry",
    runtimeStatus: connector.runtime?.status || "unreported",
    operationalStatus: connector.operationalStatus || "unverified",
    canRunReal: connector.canRunReal === true,
    verifiedOperations: Array.isArray(connector.verifiedOperations) ? connector.verifiedOperations.slice(0, 10) : [],
    probe: publicProbe(connector.probe),
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
      code,
      updatedAt: task.updatedAt || ""
    });
    groups.set(platform, values);
  }
  return groups;
}

function publicProbe(probe) {
  if (!probe || typeof probe !== "object") return null;
  return {
    status: String(probe.status || "not_run"),
    checkedAt: probe.checkedAt || null,
    expiresAt: probe.expiresAt || null,
    issueCode: String(probe.issueCode || ""),
    operations: Array.isArray(probe.operations)
      ? probe.operations.slice(0, 10).map((item) => ({
        operation: String(item.operation || ""),
        qualifier: String(item.qualifier || ""),
        subjectBound: item.subjectBound === true,
        capability: String(item.capability || ""),
        outcome: String(item.outcome || ""),
        issueCode: String(item.issueCode || ""),
        taskId: String(item.taskId || ""),
        checkedAt: item.checkedAt || null,
        expiresAt: item.expiresAt || null,
        freshness: String(item.freshness || "")
      }))
      : []
  };
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
