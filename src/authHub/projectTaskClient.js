import { normalizePlatformConnectorResult } from "../connectors/platformAuthContracts.js";
import { cloudflareServiceHeaders, validateAuthHubTarget } from "../security/authHubOutbound.js";

const TASK_STATUSES = new Set([
  "queued",
  "running",
  "approval_required",
  "action_required",
  "completed",
  "failed",
  "cancelled"
]);
const ACTIVE_TASK_STATUSES = new Set(["queued", "running"]);
const SAFE_OPERATIONS = new Set([
  "xiaohongshu/check_session",
  "xiaohongshu/search_content",
  "wechat_official/check_health",
  "github/check_auth"
]);
const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;
const MAX_RESPONSE_BYTES = 512 * 1024;

export class ProjectTaskClientError extends Error {
  constructor(code, exitCode = 1) {
    super(code);
    this.name = "ProjectTaskClientError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export async function runProjectTaskCli(argv, options = {}) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  try {
    const parsed = parseCliArgs(argv);
    if (parsed.command === "help") {
      stdout.write(`${helpText()}\n`);
      return 0;
    }

    const baseUrl = parsed.baseUrl || env.AI_LINK_AUTH_HUB_URL || "";
    const token = String(env.AI_LINK_PROJECT_TOKEN || "");
    if (!baseUrl) throw new ProjectTaskClientError("auth_hub_url_missing");
    if (token.length < 24) throw new ProjectTaskClientError("project_token_missing");

    const requestOptions = {
      baseUrl,
      token,
      env,
      fetchImpl: options.fetchImpl || globalThis.fetch,
      requestTimeoutMs: parsed.requestTimeoutMs
    };
    let task;
    let replayed = false;
    let poll = null;

    if (parsed.command === "submit") {
      const body = buildSubmitBody(parsed, env);
      const submitted = await submitProjectTask({ ...requestOptions, body });
      task = submitted.task;
      replayed = submitted.replayed;
    } else {
      task = await getProjectTask({ ...requestOptions, taskId: parsed.taskId });
    }

    if (parsed.wait && ACTIVE_TASK_STATUSES.has(task.status)) {
      const waited = await waitForProjectTask({
        ...requestOptions,
        taskId: task.id,
        initialTask: task,
        timeoutMs: parsed.timeoutMs,
        intervalMs: parsed.intervalMs,
        sleep: options.sleep,
        now: options.now
      });
      task = waited.task;
      poll = waited.poll;
    }

    const ready = task.status === "completed" && task.result?.status === "ready";
    const report = {
      schemaVersion: "1",
      ok: ready,
      accepted: true,
      ready,
      command: parsed.command,
      replayed,
      task,
      ...(poll ? { poll } : {})
    };
    writeReport(report, { json: parsed.json, stdout });
    return exitCodeForTask(task, poll);
  } catch (error) {
    const normalized = error instanceof ProjectTaskClientError
      ? error
      : new ProjectTaskClientError("client_failed");
    const report = {
      schemaVersion: "1",
      ok: false,
      error: { code: normalized.code }
    };
    if (argv.includes("--json")) stdout.write(`${JSON.stringify(report)}\n`);
    else stderr.write(`AI Link Auth Hub 项目客户端失败：${normalized.code}\n`);
    return normalized.exitCode;
  }
}

export async function submitProjectTask(options) {
  const response = await requestAuthHubJson({
    ...options,
    path: "/api/tasks",
    method: "POST",
    body: options.body,
    acceptedStatuses: [200, 201]
  });
  if (!isPlainObject(response) || typeof response.replayed !== "boolean") {
    throw new ProjectTaskClientError("response_contract_failed");
  }
  return {
    task: normalizePublicTask(response.task, {
      workflow: "platform_auth_collect",
      platform: options.body?.input?.platform,
      operation: options.body?.input?.operation,
      requestId: options.body?.options?.requestId
    }),
    replayed: response.replayed
  };
}

export async function getProjectTask(options) {
  if (!TASK_ID_PATTERN.test(String(options.taskId || ""))) {
    throw new ProjectTaskClientError("task_id_invalid");
  }
  const response = await requestAuthHubJson({
    ...options,
    path: `/api/tasks/${options.taskId}`,
    method: "GET",
    acceptedStatuses: [200]
  });
  if (!isPlainObject(response)) throw new ProjectTaskClientError("response_contract_failed");
  return normalizePublicTask(response.task, { taskId: options.taskId });
}

export async function waitForProjectTask(options) {
  const timeoutMs = boundedInteger(options.timeoutMs, 60000, 1000, 300000, "wait_timeout_invalid");
  const intervalMs = boundedInteger(options.intervalMs, 2000, 1000, 10000, "wait_interval_invalid");
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now || Date.now;
  const requestTimeoutMs = boundedInteger(
    options.requestTimeoutMs,
    20000,
    1000,
    30000,
    "request_timeout_invalid"
  );
  const startedAt = now();
  let task = options.initialTask;
  let attempts = 0;

  while (ACTIVE_TASK_STATUSES.has(task.status)) {
    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      return {
        task,
        poll: { attempts, elapsedMs, timedOut: true }
      };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs < 1000) {
      return {
        task,
        poll: { attempts, elapsedMs: now() - startedAt, timedOut: true }
      };
    }
    attempts += 1;
    if (attempts > 301) throw new ProjectTaskClientError("poll_attempt_limit_exceeded", 4);
    task = await getProjectTask({
      ...options,
      requestTimeoutMs: Math.min(requestTimeoutMs, remainingMs)
    });
  }

  return {
    task,
    poll: { attempts, elapsedMs: now() - startedAt, timedOut: false }
  };
}

export async function requestAuthHubJson({
  baseUrl,
  path,
  method,
  token,
  body,
  env = process.env,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 20000,
  acceptedStatuses = [200]
}) {
  if (typeof fetchImpl !== "function") throw new ProjectTaskClientError("fetch_unavailable");
  const targetUrl = resolveTargetUrl(baseUrl, path);
  const target = validateAuthHubTarget(targetUrl, { allowedHosts: env.AI_LINK_AUTH_HUB_ALLOWED_HOSTS });
  if (!target.ok) throw new ProjectTaskClientError("auth_hub_target_rejected");

  const clientId = String(env.CF_ACCESS_CLIENT_ID || "");
  const clientSecret = String(env.CF_ACCESS_CLIENT_SECRET || "");
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new ProjectTaskClientError("service_auth_incomplete");
  }
  if (
    target.attachServiceHeaders
    && isTrue(env.AI_LINK_AUTH_HUB_REQUIRE_SERVICE_AUTH)
    && (!clientId || !clientSecret)
  ) {
    throw new ProjectTaskClientError("service_auth_missing");
  }

  const timeout = boundedInteger(requestTimeoutMs, 20000, 1000, 30000, "request_timeout_invalid");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetchImpl(targetUrl, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...cloudflareServiceHeaders(target, { clientId, clientSecret })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    clearTimeout(timer);
    throw new ProjectTaskClientError(error?.name === "AbortError" ? "request_timeout" : "network_failed");
  }
  try {
    if (response.status >= 300 && response.status < 400) {
      await cancelBody(response);
      throw new ProjectTaskClientError("redirect_rejected");
    }
    if (!acceptedStatuses.includes(response.status)) {
      await cancelBody(response);
      throw new ProjectTaskClientError(httpErrorCode(response.status));
    }
    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      await cancelBody(response);
      throw new ProjectTaskClientError("response_not_json");
    }

    let text;
    try {
      text = await readBoundedText(response, MAX_RESPONSE_BYTES);
    } catch (error) {
      if (error instanceof ProjectTaskClientError) throw error;
      throw new ProjectTaskClientError(controller.signal.aborted ? "request_timeout" : "response_read_failed");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProjectTaskClientError("response_json_invalid");
    }
  } finally {
    clearTimeout(timer);
  }
}

export function buildSubmitBody(parsed, env = process.env) {
  const operationKey = `${parsed.platform}/${parsed.operation}`;
  if (!SAFE_OPERATIONS.has(operationKey)) {
    throw new ProjectTaskClientError("operation_not_supported");
  }
  if (!REQUEST_ID_PATTERN.test(String(parsed.requestId || ""))) {
    throw new ProjectTaskClientError("request_id_invalid");
  }

  const input = { platform: parsed.platform, operation: parsed.operation };
  if (operationKey === "xiaohongshu/search_content") {
    input.query = readEnvValue(parsed.queryEnv, env, "query_env_missing").trim();
    if (!input.query || input.query.length > 100) throw new ProjectTaskClientError("query_invalid");
    input.limit = boundedInteger(parsed.limit, 4, 1, 4, "limit_invalid");
    input.sort = "latest";
    input.mode = "read_only";
  }
  if (operationKey === "github/check_auth") {
    const target = readEnvValue(parsed.githubTargetEnv, env, "github_target_env_missing");
    const match = target.match(/^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/);
    if (!match) throw new ProjectTaskClientError("github_target_invalid");
    input.owner = match[1];
    input.repo = match[2];
    input.scope = parsed.scope || "repo_read";
    if (!["repo_read", "actions_read", "pull_request_read"].includes(input.scope)) {
      throw new ProjectTaskClientError("github_scope_invalid");
    }
  }

  return {
    workflow: "platform_auth_collect",
    input,
    options: { requestId: parsed.requestId }
  };
}

export function normalizePublicTask(value, expected = {}) {
  if (!isPlainObject(value)) throw new ProjectTaskClientError("response_contract_failed");
  const id = String(value.id || "");
  const workflow = String(value.workflow || "");
  const status = String(value.status || "");
  const platform = String(value.input?.platform || "");
  const operation = String(value.input?.operation || "");
  if (
    !TASK_ID_PATTERN.test(id)
    || workflow !== "platform_auth_collect"
    || !TASK_STATUSES.has(status)
    || !SAFE_OPERATIONS.has(`${platform}/${operation}`)
  ) {
    throw new ProjectTaskClientError("response_contract_failed");
  }
  if (
    (expected.taskId && id !== expected.taskId)
    || (expected.workflow && workflow !== expected.workflow)
    || (expected.platform && platform !== expected.platform)
    || (expected.operation && operation !== expected.operation)
    || (expected.requestId && String(value.options?.requestId || "") !== expected.requestId)
  ) {
    throw new ProjectTaskClientError("response_binding_failed");
  }

  let result = null;
  const errorCode = typeof value.error?.code === "string" && /^[a-z0-9_.-]{1,80}$/.test(value.error.code)
    ? value.error.code
    : "";
  if (status === "completed" && errorCode) {
    throw new ProjectTaskClientError("response_contract_failed");
  }
  if (["completed", "action_required", "failed"].includes(status)) {
    if (value.result === null || value.result === undefined) {
      throw new ProjectTaskClientError("response_contract_failed");
    }
    try {
      result = normalizePlatformConnectorResult(value.result, { platform, operation });
    } catch {
      throw new ProjectTaskClientError("response_contract_failed");
    }
    if (
      (status === "completed" && result.status !== "ready")
      || (status === "action_required" && result.status !== "needs_action")
      || (status === "failed" && result.status !== "blocked")
      || (status !== "completed" && (!errorCode || errorCode !== result.action_required?.code))
    ) {
      throw new ProjectTaskClientError("response_contract_failed");
    }
  }
  return {
    id,
    workflow,
    status,
    platform,
    operation,
    ...(result ? { result } : {}),
    ...(errorCode ? { error: { code: errorCode } } : {}),
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt)
  };
}

function parseCliArgs(argv) {
  const command = argv[0] || "help";
  if (["help", "--help", "-h"].includes(command)) return { command: "help" };
  if (!["submit", "status"].includes(command)) throw new ProjectTaskClientError("command_invalid");

  const booleanFlags = new Set(["--wait", "--json"]);
  const valueFlags = new Set([
    "--base-url",
    "--platform",
    "--operation",
    "--request-id",
    "--github-target-env",
    "--scope",
    "--query-env",
    "--limit",
    "--task-id",
    "--timeout-ms",
    "--interval-ms",
    "--request-timeout-ms"
  ]);
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (Object.hasOwn(values, flag)) throw new ProjectTaskClientError("argument_duplicate");
    if (booleanFlags.has(flag)) {
      values[flag] = true;
      continue;
    }
    if (!valueFlags.has(flag) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw new ProjectTaskClientError("argument_invalid");
    }
    values[flag] = argv[index + 1];
    index += 1;
  }
  const commonFlags = [
    "--base-url",
    "--wait",
    "--json",
    "--timeout-ms",
    "--interval-ms",
    "--request-timeout-ms"
  ];
  const commandFlags = command === "status"
    ? new Set([...commonFlags, "--task-id"])
    : new Set([
        ...commonFlags,
        "--platform",
        "--operation",
        "--request-id",
        "--github-target-env",
        "--scope",
        "--query-env",
        "--limit"
      ]);
  if (Object.keys(values).some((flag) => !commandFlags.has(flag))) {
    throw new ProjectTaskClientError("argument_not_allowed_for_command");
  }
  const common = {
    command,
    baseUrl: values["--base-url"] || "",
    wait: values["--wait"] === true,
    json: values["--json"] === true,
    timeoutMs: numberOrUndefined(values["--timeout-ms"]),
    intervalMs: numberOrUndefined(values["--interval-ms"]),
    requestTimeoutMs: numberOrUndefined(values["--request-timeout-ms"])
  };
  if (command === "status") {
    return { ...common, taskId: values["--task-id"] || "" };
  }
  return {
    ...common,
    platform: values["--platform"] || "",
    operation: values["--operation"] || "",
    requestId: values["--request-id"] || "",
    githubTargetEnv: values["--github-target-env"] || "",
    scope: values["--scope"] || "repo_read",
    queryEnv: values["--query-env"] || "",
    limit: numberOrUndefined(values["--limit"])
  };
}

function resolveTargetUrl(baseUrl, path) {
  let base;
  try {
    base = new URL(String(baseUrl || ""));
  } catch {
    throw new ProjectTaskClientError("auth_hub_url_invalid");
  }
  if (base.search || base.hash) throw new ProjectTaskClientError("auth_hub_url_invalid");
  return new URL(path, `${base.origin}/`).toString();
}

function readEnvValue(name, env, missingCode) {
  if (!ENV_NAME_PATTERN.test(String(name || ""))) throw new ProjectTaskClientError(missingCode);
  const value = String(env[name] || "");
  if (!value) throw new ProjectTaskClientError(missingCode);
  return value;
}

async function readBoundedText(response, maximumBytes) {
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(length) && length > maximumBytes) {
    await cancelBody(response);
    throw new ProjectTaskClientError("response_too_large");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maximumBytes) throw new ProjectTaskClientError("response_too_large");
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ProjectTaskClientError("response_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // The response is intentionally discarded without exposing its body.
  }
}

function httpErrorCode(status) {
  if (status === 401) return "authentication_failed";
  if (status === 403) return "authorization_failed";
  if (status === 404) return "task_not_found";
  if (status === 409) return "idempotency_conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "auth_hub_unavailable";
  return "request_rejected";
}

function exitCodeForTask(task, poll) {
  if (poll?.timedOut) return 4;
  if (["approval_required", "action_required"].includes(task.status)) return 2;
  if (["failed", "cancelled"].includes(task.status)) return 3;
  return 0;
}

function writeReport(report, { json, stdout }) {
  if (json) {
    stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  const replay = report.replayed ? "（幂等复用）" : "";
  const poll = report.poll?.timedOut ? "，等待已超时" : "";
  const readiness = report.ready ? "，授权已就绪" : "，尚未就绪";
  stdout.write(`Auth Hub 任务${replay}：${report.task.id}，状态 ${report.task.status}${readiness}${poll}\n`);
}

function helpText() {
  return [
    "AI Link Auth Hub 项目客户端",
    "",
    "提交：ai-link-auth-hub submit --platform <name> --operation <name> --request-id <id> [--wait] [--json]",
    "查询：ai-link-auth-hub status --task-id <uuid> [--wait] [--json]",
    "",
    "环境变量：AI_LINK_AUTH_HUB_URL、AI_LINK_PROJECT_TOKEN。GitHub 目标和小红书查询必须通过 --*-env 指定环境变量名。",
    "客户端不支持登录、审批、发布、connector probe 或任何平台写操作。"
  ].join("\n");
}

function boundedInteger(value, fallback, minimum, maximum, errorCode) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ProjectTaskClientError(errorCode);
  }
  return number;
}

function numberOrUndefined(value) {
  return value === undefined ? undefined : Number(value);
}

function normalizeTimestamp(value) {
  const text = String(value || "");
  if (text.length > 64 || Number.isNaN(Date.parse(text))) {
    throw new ProjectTaskClientError("response_contract_failed");
  }
  return text;
}

function isTrue(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
