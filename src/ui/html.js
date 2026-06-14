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
    .status.completed { color:var(--ok); border-color:#abefc6; background:#ecfdf3; }
    .status.failed, .status.cancelled { color:var(--danger); border-color:#fecdca; background:#fef3f2; }
    .status.approval_required { color:#9a6700; border-color:#fedf89; background:#fffaeb; }
    button, .button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--accent); background:var(--accent); color:#fff; border-radius:6px; padding:9px 12px; font-weight:600; cursor:pointer; }
    button.secondary { color:var(--text); background:#fff; border-color:var(--line); }
    input, textarea, select { width:100%; border:1px solid var(--line); border-radius:6px; padding:10px; font:inherit; background:#fff; }
    label { display:block; margin:12px 0 6px; color:var(--muted); font-size:14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
    .muted { color:var(--muted); }
    .error { color:var(--danger); }
  </style>
</head>
<body>
  <header>
    <strong>AI Link 授权中枢</strong>
    <nav><a href="/dashboard">任务</a> · <a href="/logout">退出</a></nav>
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

export function dashboardPage({ tasks, approvals }) {
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
      <table><thead><tr><th>ID</th><th>流程</th><th>状态</th><th>摘要</th><th>更新时间</th></tr></thead><tbody>${taskRows || "<tr><td colspan=\"5\">暂无任务</td></tr>"}</tbody></table>
    </section>
    <section class="panel">
      <h2>待确认动作</h2>
      <table><thead><tr><th>ID</th><th>动作</th><th>摘要</th><th>状态</th></tr></thead><tbody>${approvalRows || "<tr><td colspan=\"4\">暂无待确认事项</td></tr>"}</tbody></table>
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
      <h2>脱敏结果</h2>
      <pre>${escapeHtml(JSON.stringify(task.result || {}, null, 2))}</pre>
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
      <h2>审计记录</h2>
      <pre>${escapeHtml(JSON.stringify(auditEvents, null, 2))}</pre>
    </section>`
  });
}
