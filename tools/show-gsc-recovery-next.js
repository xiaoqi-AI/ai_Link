import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function hasFlag(name) {
  return process.argv.includes(name);
}

function runSchedulePlan() {
  const output = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(repoRoot, "tools", "install-gsc-monitor-task.ps1")
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: "1" }
    }
  );
  return JSON.parse(output);
}

function latestCheck(plan) {
  const check = plan.latestCheck && plan.latestCheck.readable ? plan.latestCheck : null;
  if (!check) return null;
  return {
    checkedAt: check.checkedAt || null,
    totalUrls: Number.isFinite(check.totalUrls) ? check.totalUrls : null,
    publicReady: Number.isFinite(check.publicReady) ? check.publicReady : null,
    requiresManualAction: Boolean(check.requiresManualAction),
    errorCodes: Array.isArray(check.errorCodes) ? check.errorCodes : []
  };
}

function sanitize(plan) {
  const check = latestCheck(plan);
  return {
    ok: Boolean(plan.applyReady),
    generatedAt: new Date().toISOString(),
    credentialReady: Boolean(plan.credentialReady),
    credentialHealth: plan.credentialHealth || "unknown",
    credentialAgeHours: plan.credentialFile && Number.isFinite(plan.credentialFile.ageHours)
      ? plan.credentialFile.ageHours
      : null,
    configReady: Boolean(plan.configReady),
    applyReady: Boolean(plan.applyReady),
    latestCheck: check,
    operatorActionCode: actionCode(plan.credentialHealth || "unknown", check),
    nextCommands: nextCommands(plan.credentialHealth || "unknown")
  };
}

function actionCode(credentialHealth, check) {
  if (credentialHealth === "missing") return "authorize_required";
  if (credentialHealth === "oauth_refresh_failed") return "recover_oauth";
  if (credentialHealth === "property_not_listed") return "confirm_gsc_property_account_then_recover";
  if (credentialHealth === "usable_last_check") return "ready_to_apply_schedule";
  if (check && check.requiresManualAction) return "review_latest_gsc_report";
  return "run_private_check_or_recover";
}

function nextCommands(credentialHealth) {
  if (credentialHealth === "usable_last_check") {
    return [
      "cd D:\\codex_workplace\\ai_Link",
      "npm.cmd run gsc:schedule:plan",
      "powershell -ExecutionPolicy Bypass -File tools\\install-gsc-monitor-task.ps1 -At \"13:00\" -Apply"
    ];
  }
  return [
    "cd D:\\codex_workplace\\ai_Link",
    "npm.cmd run gsc:recover -- -ProxyUrl \"http://127.0.0.1:4780\" -ManualCallbackUrl",
    "npm.cmd run gsc:recover:next"
  ];
}

function conclusion(status) {
  if (status.credentialHealth === "oauth_refresh_failed") {
    return "GSC 只读授权已过期或刷新失败，需要人工重新授权。站点公开抓取是否正常，请以 ParentingGame 的 seo:status:zh 或 AI Link 公开检查为准。";
  }
  if (status.credentialHealth === "property_not_listed") {
    return "当前授权账号看不到配置的 GSC Domain Property。请确认浏览器里登录的是能访问 xiao-qi-ai.com Search Console 的 Google 账号，然后重新授权。";
  }
  if (status.credentialHealth === "usable_last_check" && status.applyReady) {
    return "GSC 只读授权最近一次脱敏检查可用，可以启用或继续使用每日只读监控。";
  }
  if (!status.credentialReady) {
    return "本机还没有 GSC 只读授权文件，需要先完成授权。";
  }
  return "GSC 授权存在，但还没有足够证据证明可用。建议运行恢复命令完成授权和私有只读复核。";
}

function yesNo(value) {
  return value ? "是" : "否";
}

function markdown(status) {
  const check = status.latestCheck;
  const publicReady = check && check.publicReady !== null && check.totalUrls !== null
    ? `${check.publicReady} / ${check.totalUrls}`
    : "无最新脱敏结果";
  const errors = check && check.errorCodes.length ? check.errorCodes.join(", ") : "无";
  return [
    "# AI Link GSC 恢复下一步",
    "",
    `生成时间：${status.generatedAt}`,
    "",
    "## 结论",
    "",
    conclusion(status),
    "",
    "## 脱敏状态",
    "",
    "| 项目 | 当前值 |",
    "|---|---|",
    `| GSC 凭据存在 | ${yesNo(status.credentialReady)} |`,
    `| GSC 授权健康 | ${status.credentialHealth} |`,
    `| 凭据文件年龄 | ${status.credentialAgeHours === null ? "未知" : `${status.credentialAgeHours} 小时`} |`,
    `| 配置存在 | ${yesNo(status.configReady)} |`,
    `| 可以启用每日私有监控 | ${yesNo(status.applyReady)} |`,
    `| 最新检查时间 | ${check && check.checkedAt ? check.checkedAt : "无"} |`,
    `| 最新公开 ready URL | ${publicReady} |`,
    `| 稳定错误码 | ${errors} |`,
    "",
    "## 下一步命令",
    "",
    "```powershell",
    ...status.nextCommands,
    "```",
    "",
    "## 安全边界",
    "",
    "- 本命令只输出脱敏状态和下一步命令。",
    "- 不打印 OAuth token、authorization code、callback URL、client secret、Cookie 或 Google 原始响应。",
    "- 如果浏览器授权后需要手动回填 `127.0.0.1` 回调 URL，只能粘贴到本机终端，不要发到聊天、PR、issue 或知识库。"
  ].join("\n");
}

function main() {
  const status = sanitize(runSchedulePlan());
  if (hasFlag("--json")) {
    console.log(JSON.stringify({ ...status, conclusion: conclusion(status) }, null, 2));
  } else {
    console.log(markdown(status));
  }
  if (hasFlag("--strict") && !status.ok) process.exitCode = 1;
}

main();
