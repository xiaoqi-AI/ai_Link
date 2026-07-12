function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function layout({ title, body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - AI Link</title>
  <style>
    :root { color-scheme: light; --bg:#f7f8fa; --panel:#ffffff; --text:#162033; --muted:#5d6b82; --line:#d9dee8; --accent:#1f6feb; --danger:#b42318; --ok:#067647; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Arial, "Microsoft YaHei", sans-serif; background:var(--bg); color:var(--text); }
    header { background:#fff; border-bottom:1px solid var(--line); padding:14px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    main { max-width:1100px; margin:0 auto; padding:24px; }
    a { color:var(--accent); text-decoration:none; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; margin-bottom:16px; }
    .toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th, td { border-bottom:1px solid var(--line); padding:10px 8px; text-align:left; vertical-align:top; }
    th { color:var(--muted); font-weight:600; }
    code, pre { background:#eef1f6; border-radius:6px; }
    code { padding:2px 5px; }
    pre { padding:12px; overflow:auto; white-space:pre-wrap; }
    .status { display:inline-flex; min-width:96px; justify-content:center; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; color:var(--muted); background:#fff; }
    .status.completed, .status.ready { color:var(--ok); border-color:#abefc6; background:#ecfdf3; }
    .status.failed, .status.cancelled, .status.misconfigured, .status.blocked { color:var(--danger); border-color:#fecdca; background:#fef3f2; }
    .status.approval_required { color:#9a6700; border-color:#fedf89; background:#fffaeb; }
    .status.action_required, .status.needs_action { color:#b54708; border-color:#fed7aa; background:#fff7ed; }
    .status.available { color:var(--ok); border-color:#abefc6; background:#ecfdf3; }
    .status.reserved { color:var(--muted); border-color:var(--line); background:#f8fafc; }
    button, .button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--accent); background:var(--accent); color:#fff; border-radius:6px; padding:9px 12px; font-weight:600; cursor:pointer; }
    button.secondary { color:var(--text); background:#fff; border-color:var(--line); }
    input, textarea, select { width:100%; border:1px solid var(--line); border-radius:6px; padding:10px; font:inherit; background:#fff; }
    label { display:block; margin:12px 0 6px; color:var(--muted); font-size:14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:14px 0; }
    .stat { border:1px solid var(--line); border-radius:8px; background:#fff; padding:12px; }
    .stat strong { display:block; font-size:22px; margin-bottom:4px; }
    .muted { color:var(--muted); }
    .error { color:var(--danger); }
  </style>
</head>
<body>
  <header>
    <strong>AI Link 授权中枢</strong>
    <nav><a href="/dashboard">任务</a> · <a href="/dashboard/audit">审计</a> · <a href="/dashboard/connectors">连接器</a> · <a href="/logout">退出</a></nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

export function loginPage({ error = "", next = "/dashboard" } = {}) {
  return layout({
    title: "登录",
    body: `<section class="panel" style="max-width:420px;margin:40px auto;">
      <h1>登录控制台</h1>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <form method="post" action="/login">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label for="password">控制台密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <p><button type="submit">进入</button></p>
      </form>
      <p class="muted">生产环境建议同时启用 Cloudflare Access。</p>
    </section>`
  });
}

export function dashboardPage({ tasks, actionTasks = [], approvals, connectors = [], authStatus = null }) {
  const statusCounts = countTaskStatuses(tasks);
  const taskRows = tasks.map((task) => `<tr>
    <td><a href="/dashboard/tasks/${escapeHtml(task.id)}">${escapeHtml(task.id.slice(0, 8))}</a></td>
    <td>${escapeHtml(task.workflow)}</td>
    <td><span class="status ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></td>
    <td>${escapeHtml(task.summary || task.input?.title || task.input?.url || "待处理")}</td>
    <td>${escapeHtml(task.updatedAt)}</td>
  </tr>`).join("");

  const approvalRows = approvals.map((approval) => `<tr>
    <td><a href="/dashboard/tasks/${escapeHtml(approval.taskId)}">${escapeHtml(approval.id.slice(0, 8))}</a></td>
    <td>${escapeHtml(approval.title)}</td>
    <td>${escapeHtml(approval.summary)}</td>
    <td><span class="status ${escapeHtml(approval.status)}">${escapeHtml(approval.status)}</span></td>
  </tr>`).join("");

  const actionRows = actionTasks.map((task) => `<tr>
    <td><a href="/dashboard/tasks/${escapeHtml(task.id)}">${escapeHtml(task.id.slice(0, 8))}</a></td>
    <td>${escapeHtml(task.workflow)}</td>
    <td>${escapeHtml(task.summary || task.error?.message || "需要人工处理")}</td>
    <td>${escapeHtml(task.updatedAt)}</td>
  </tr>`).join("");

  const connectorRows = connectorRowsHtml(connectors);
  const authStatusRows = authStatusRowsHtml(authStatus);
  const authNextActionRows = authNextActionRowsHtml(authStatus);

  return layout({
    title: "任务",
    body: `<section class="panel">
      <div class="toolbar">
        <div>
          <h1>任务队列</h1>
          <p class="muted">控制台只展示脱敏摘要；平台登录态保留在本地执行器。</p>
        </div>
        <a class="button" href="/dashboard/new">新建任务</a>
      </div>
      <div class="stats">
        <div class="stat"><strong>${escapeHtml(statusCounts.queued || 0)}</strong><span class="muted">排队</span></div>
        <div class="stat"><strong>${escapeHtml(statusCounts.running || 0)}</strong><span class="muted">执行中</span></div>
        <div class="stat"><strong>${escapeHtml(statusCounts.action_required || 0)}</strong><span class="muted">待人工处理</span></div>
        <div class="stat"><strong>${escapeHtml(statusCounts.approval_required || 0)}</strong><span class="muted">待确认发布</span></div>
      </div>
      <table><thead><tr><th>ID</th><th>流程</th><th>状态</th><th>摘要</th><th>更新时间</th></tr></thead><tbody>${taskRows || "<tr><td colspan=\"5\">暂无任务</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>待人工处理</h2>
      <table><thead><tr><th>ID</th><th>流程</th><th>事项</th><th>更新时间</th></tr></thead><tbody>${actionRows || "<tr><td colspan=\"4\">暂无待人工处理事项</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>授权/登录关注项</h2>
      <p class="muted">只展示公开安全状态：平台、处理动作、公开错误码和关联任务；不读取或展示 Cookie、Profile、token、账号详情。</p>
      ${authNextActionRows ? `<h3>下一步行动</h3><table><thead><tr><th>平台</th><th>负责人</th><th>动作</th><th>处理说明</th><th>关联任务</th></tr></thead><tbody>${authNextActionRows}</tbody></table>` : ""}
      <table><thead><tr><th>平台</th><th>状态</th><th>处理建议</th><th>原因</th><th>关联任务</th></tr></thead><tbody>${authStatusRows || "<tr><td colspan=\"5\">暂无授权/登录关注项</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>连接器状态</h2>
      <table><thead><tr><th>平台</th><th>状态</th><th>能力</th><th>问题</th></tr></thead><tbody>${connectorRows || "<tr><td colspan=\"4\">暂无连接器状态</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>待确认动作</h2>
      <table><thead><tr><th>ID</th><th>动作</th><th>摘要</th><th>状态</th></tr></thead><tbody>${approvalRows || "<tr><td colspan=\"4\">暂无待确认事项</td></tr>"}</tbody></table>
    </section>`
  });
}

function countTaskStatuses(tasks) {
  return tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    return counts;
  }, {});
}

function connectorRowsHtml(connectors) {
  return connectors.map((connector) => `<tr>
    <td>${escapeHtml(connector.platform)}</td>
    <td><span class="status ${escapeHtml(connector.status)}">${escapeHtml(connectorStatusLabel(connector.status))}</span></td>
    <td>${connector.capabilities.map((capability) => `${escapeHtml(capability.name)}：${escapeHtml(capability.available ? "可用" : "待接入")}`).join("<br>")}</td>
    <td>${connector.issues.length ? escapeHtml(connector.issues.map((issue) => issue.code).join(", ")) : "无"}</td>
  </tr>`).join("");
}

function authStatusRowsHtml(authStatus) {
  return (authStatus?.items || []).map((item) => `<tr>
    <td>${escapeHtml(item.platform)}</td>
    <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(authStatusLabel(item.status))}</span></td>
    <td>${escapeHtml(item.action || "-")}</td>
    <td>${escapeHtml(item.reason || "-")}</td>
    <td>${authTaskLinks(item.relatedTaskIds)}</td>
  </tr>`).join("");
}

function authNextActionRowsHtml(authStatus) {
  return (authStatus?.nextActions || []).map((action) => `<tr>
    <td>${escapeHtml(action.platform)}</td>
    <td>${escapeHtml(authActionOwnerLabel(action.owner))}</td>
    <td>${escapeHtml(action.title || "-")}</td>
    <td>${escapeHtml(action.runbook || "-")}</td>
    <td>${authTaskLinks(action.relatedTaskIds)}</td>
  </tr>`).join("");
}

function authTaskLinks(taskIds = []) {
  if (!taskIds.length) {
    return "-";
  }
  return taskIds.map((taskId) => `<a href="/dashboard/tasks/${escapeHtml(taskId)}">${escapeHtml(taskId.slice(0, 8))}</a>`).join("<br>");
}

function authStatusLabel(status) {
  return {
    ready: "可用",
    needs_action: "需要处理",
    reserved: "预留",
    blocked: "阻塞"
  }[status] || status;
}

function connectorStatusLabel(status) {
  return {
    available: "可用",
    reserved: "预留",
    misconfigured: "配置异常"
  }[status] || status;
}

function authActionOwnerLabel(owner) {
  return {
    account_owner: "账号负责人",
    maintainer: "维护者",
    secret_owner: "密钥负责人",
    platform_admin: "平台管理员",
    connector_maintainer: "连接器维护者"
  }[owner] || owner;
}

export function connectorsPage({ connectors = [], issues = [], authStatus = null }) {
  const issueRows = issues.map((issue) => `<tr>
    <td>${escapeHtml(issue.platform)}</td>
    <td>${escapeHtml(issue.severity)}</td>
    <td>${escapeHtml(issue.code)}</td>
    <td>${escapeHtml(issue.capability || "")}</td>
  </tr>`).join("");
  const authNextActionRows = authNextActionRowsHtml(authStatus);

  return layout({
    title: "连接器",
    body: `<section class="panel">
      <p><a href="/dashboard">返回任务列表</a></p>
      <h1>连接器状态</h1>
      <table><thead><tr><th>平台</th><th>状态</th><th>能力</th><th>问题</th></tr></thead><tbody>${connectorRowsHtml(connectors) || "<tr><td colspan=\"4\">暂无连接器状态</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>授权/登录关注项</h2>
      <p class="muted">该表只汇总公开安全状态，用来判断是否需要本机续登、验证码、凭据配置或连接器维护。</p>
      ${authNextActionRows ? `<h3>下一步行动</h3><table><thead><tr><th>平台</th><th>负责人</th><th>动作</th><th>处理说明</th><th>关联任务</th></tr></thead><tbody>${authNextActionRows}</tbody></table>` : ""}
      <table><thead><tr><th>平台</th><th>状态</th><th>处理建议</th><th>原因</th><th>关联任务</th></tr></thead><tbody>${authStatusRowsHtml(authStatus) || "<tr><td colspan=\"5\">暂无授权/登录关注项</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>契约问题</h2>
      <table><thead><tr><th>平台</th><th>级别</th><th>代码</th><th>能力</th></tr></thead><tbody>${issueRows || "<tr><td colspan=\"4\">暂无契约问题</td></tr>"}</tbody></table>
    </section>`
  });
}

export function auditPage({ auditEvents = [], filters = {} }) {
  const eventRows = auditEvents.map((event) => `<tr>
    <td>${escapeHtml(event.createdAt)}</td>
    <td>${event.taskId ? `<a href="/dashboard/tasks/${escapeHtml(event.taskId)}">${escapeHtml(event.taskId.slice(0, 8))}</a>` : "-"}</td>
    <td>${escapeHtml(event.eventType)}</td>
    <td>${escapeHtml(event.actor)}</td>
    <td>${escapeHtml(auditEventSummary(event))}</td>
  </tr>`).join("");

  const aiLinkRows = auditEvents
    .filter((event) => event.eventType === "ai_link.audit")
    .flatMap((event) => aiLinkAuditRows(event.detail?.audit, event.detail?.recordId || event.id, event.detail?.status));

  return layout({
    title: "审计",
    body: `<section class="panel">
      <div class="toolbar">
        <div>
          <h1>审计日志</h1>
          <p class="muted">只展示脱敏后的任务事件和 AI Link 审计摘要。</p>
        </div>
      </div>
      <form method="get" action="/dashboard/audit">
        <div class="grid">
          <div>
            <label for="taskId">Task ID</label>
            <input id="taskId" name="taskId" value="${escapeHtml(filters.taskId || "")}" placeholder="可选">
          </div>
          <div>
            <label for="eventType">事件类型</label>
            <select id="eventType" name="eventType">
              ${auditEventTypeOptions(filters.eventType || "")}
            </select>
          </div>
          <div>
            <label for="limit">数量</label>
            <input id="limit" name="limit" type="number" min="1" max="200" value="${escapeHtml(filters.limit || 100)}">
          </div>
        </div>
        <p><button type="submit">筛选</button></p>
      </form>
    </section>
    ${aiLinkRows.length ? `<section class="panel"><h2>AI Link 审计摘要</h2>${auditSummaryTable(aiLinkRows)}</section>` : ""}
    <section class="panel">
      <h2>事件</h2>
      <table><thead><tr><th>时间</th><th>任务</th><th>类型</th><th>操作者</th><th>摘要</th></tr></thead><tbody>${eventRows || "<tr><td colspan=\"5\">暂无审计事件</td></tr>"}</tbody></table>
    </section>`
  });
}

export function newTaskPage() {
  return layout({
    title: "新建任务",
    body: `<section class="panel">
      <h1>新建全链路任务</h1>
      <form method="post" action="/dashboard/tasks">
        <label for="url">素材链接</label>
        <input id="url" name="url" placeholder="https://mp.weixin.qq.com/...">
        <label for="title">标题</label>
        <input id="title" name="title" placeholder="可选">
        <label for="text">正文或说明</label>
        <textarea id="text" name="text" rows="8" placeholder="可选。不要粘贴密钥、Cookie、二维码或私密截图。"></textarea>
        <label for="workflow">流程</label>
        <select id="workflow" name="workflow">
          <option value="full_chain">全链路：取材、检测、草稿、确认发布、回收</option>
          <option value="read_detect">只取材和检测</option>
          <option value="draft_only">生成草稿并等待确认</option>
        </select>
        <p><button type="submit">创建任务</button></p>
      </form>
    </section>`
  });
}

export function taskPage({ task, approvals, artifacts, auditEvents }) {
  const pendingApproval = approvals.find((item) => item.status === "pending");
  const needsAction = task.status === "action_required";
  const resultAuditRows = aiLinkAuditRows(task.result?.aiLinkAudit, "task.result");
  const auditEventRows = auditEvents
    .filter((event) => event.eventType === "ai_link.audit")
    .flatMap((event) => aiLinkAuditRows(event.detail?.audit, event.detail?.recordId || event.id, event.detail?.status));
  return layout({
    title: `任务 ${task.id.slice(0, 8)}`,
    body: `<section class="panel">
      <p><a href="/dashboard">返回任务列表</a></p>
      <h1>任务 ${escapeHtml(task.id)}</h1>
      <p><span class="status ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></p>
      <div class="grid">
        <div><strong>流程</strong><p>${escapeHtml(task.workflow)}</p></div>
        <div><strong>当前步骤</strong><p>${escapeHtml(task.currentStep)}</p></div>
        <div><strong>更新时间</strong><p>${escapeHtml(task.updatedAt)}</p></div>
      </div>
      <h2>摘要</h2>
      <p>${escapeHtml(task.summary || "暂无摘要")}</p>
      ${task.error ? `<h2>待处理事项</h2><pre>${escapeHtml(JSON.stringify(task.error, null, 2))}</pre>` : ""}
      ${needsAction ? `<form method="post" action="/dashboard/tasks/${escapeHtml(task.id)}/retry">
        <label for="retry-note">处理备注</label>
        <input id="retry-note" name="note" placeholder="例如：已续登、已完成验证码、稍后重试">
        <button type="submit">已处理，重新执行</button>
      </form>` : ""}
      <h2>脱敏结果</h2>
      <pre>${escapeHtml(JSON.stringify(task.result || {}, null, 2))}</pre>
      ${resultAuditRows ? `<h2>AI Link Audit</h2>${auditSummaryTable(resultAuditRows)}` : ""}
      ${pendingApproval ? `<form method="post" action="/dashboard/tasks/${escapeHtml(task.id)}/approve">
        <input type="hidden" name="approvalId" value="${escapeHtml(pendingApproval.id)}">
        <label for="note">确认备注</label>
        <input id="note" name="note" placeholder="可选">
        <button type="submit" name="decision" value="approve">确认继续</button>
        <button class="secondary" type="submit" name="decision" value="reject">拒绝</button>
      </form>` : ""}
    </section>
    <section class="panel">
      <h2>审批记录</h2>
      <pre>${escapeHtml(JSON.stringify(approvals, null, 2))}</pre>
      <h2>产物摘要</h2>
      <pre>${escapeHtml(JSON.stringify(artifacts, null, 2))}</pre>
      ${auditEventRows.length ? `<h2>AI Link 审计摘要</h2>${auditSummaryTable(auditEventRows)}` : ""}
      <h2>审计记录</h2>
      <pre>${escapeHtml(JSON.stringify(auditEvents, null, 2))}</pre>
    </section>`
  });
}

function auditSummaryTable(rows) {
  return `<table><thead><tr><th>来源</th><th>阶段/任务</th><th>Provider</th><th>Model</th><th>Policy</th><th>审批</th><th>预算</th><th>用量估算</th><th>状态</th></tr></thead><tbody>${rows.map((row) => `<tr>
    <td>${escapeHtml(row.source)}</td>
    <td>${escapeHtml(row.task)}</td>
    <td>${escapeHtml(row.provider)}</td>
    <td>${escapeHtml(row.model)}</td>
    <td>${escapeHtml(row.policy)}</td>
    <td>${escapeHtml(row.approval)}</td>
    <td>${escapeHtml(row.budget)}</td>
    <td>${escapeHtml(row.usage)}</td>
    <td>${escapeHtml(row.status)}</td>
  </tr>`).join("")}</tbody></table>`;
}

function auditEventTypeOptions(selected) {
  const options = [
    ["", "全部"],
    ["ai_link.audit", "AI Link 审计"],
    ["task.created", "任务创建"],
    ["task.leased", "任务领取"],
    ["task.completed", "任务完成"],
    ["task.approval_required", "待审批"],
    ["task.action_required", "待人工处理"],
    ["task.failed", "失败"],
    ["task.requeued", "重新排队"]
  ];
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function auditEventSummary(event) {
  if (event.eventType === "ai_link.audit" && event.detail?.audit) {
    const rows = aiLinkAuditRows(event.detail.audit, event.detail?.recordId || event.id, event.detail?.status);
    const first = rows[0];
    if (first) {
      return [first.provider, first.model, first.policy, first.status].filter((item) => item && item !== "-").join(" / ");
    }
  }
  if (event.detail?.status) {
    return event.detail.status;
  }
  if (event.detail?.workflow) {
    return event.detail.workflow;
  }
  if (event.detail?.currentStep) {
    return event.detail.currentStep;
  }
  if (event.detail?.error?.message) {
    return event.detail.error.message;
  }
  return JSON.stringify(event.detail || {});
}

function aiLinkAuditRows(audit, source, status = "") {
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    return [];
  }

  if (audit.kind === "workflow" && Array.isArray(audit.stages)) {
    return audit.stages
      .filter((stage) => stage && typeof stage === "object")
      .flatMap((stage) => {
        const stageRows = aiLinkAuditRows(stage.result, source, status);
        return stageRows.map((row) => ({
          ...row,
          task: [stage.name, row.task].filter(Boolean).join(" / ")
        }));
      });
  }

  return [{
    source,
    task: audit.task || audit.kind || "-",
    provider: audit.provider || audit.providerType || "-",
    model: audit.model || "-",
    policy: audit.policy || "-",
    approval: approvalLabel(audit.approval),
    budget: budgetLabel(audit.policyBudget),
    usage: usageLabel(audit.usageEstimate),
    status: [status, audit.dryRun === true ? "dry-run" : ""].filter(Boolean).join(" / ") || "-"
  }];
}

function approvalLabel(approval) {
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    return "-";
  }
  const required = approval.required ? "required" : "optional";
  const approved = approval.approved ? "approved" : "not approved";
  return [required, approved, approval.mode].filter(Boolean).join(" / ");
}

function budgetLabel(budget) {
  if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
    return "-";
  }
  const parts = [];
  if (Number.isFinite(budget.maxInputTokens)) {
    parts.push(`in<=${budget.maxInputTokens}`);
  }
  if (Number.isFinite(budget.maxOutputTokens)) {
    parts.push(`out<=${budget.maxOutputTokens}`);
  }
  if (Number.isFinite(budget.maxEstimatedCostUsd)) {
    parts.push(`cost<=${budget.maxEstimatedCostUsd}`);
  }
  return parts.join(", ") || "-";
}

function usageLabel(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return "-";
  }
  const parts = [];
  if (Number.isFinite(usage.inputTokens)) {
    parts.push(`in=${usage.inputTokens}`);
  }
  if (Number.isFinite(usage.outputTokens)) {
    parts.push(`out=${usage.outputTokens}`);
  }
  if (Number.isFinite(usage.estimatedCostUsd)) {
    parts.push(`cost=${usage.estimatedCostUsd}`);
  }
  return parts.join(", ") || "-";
}
