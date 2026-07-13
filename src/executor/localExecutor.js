#!/usr/bin/env node
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildExecutorCapabilityHeartbeat } from "../connectors/executorCapabilities.js";
import { loadPrivateConnectorRegistry } from "../connectors/privateLoader.js";
import { cloudflareServiceHeaders, validateAuthHubTarget } from "../security/authHubOutbound.js";
import { runTask } from "./runTask.js";

const args = new Set(process.argv.slice(2));
const PROCESS_EXECUTOR_SESSION_ID = crypto.randomUUID();

function readEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

async function writeState(statePath, state) {
  if (!statePath) return;
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    JSON.stringify(
      {
        ...state,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

async function requestJson(url, { token, method = "GET", body } = {}) {
  const target = validateAuthHubTarget(url);
  if (!target.ok) {
    const error = new Error(target.detail);
    error.code = "auth_hub_target_rejected";
    throw error;
  }
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    ...cloudflareServiceHeaders(target)
  };
  const cfAccessJwt = readEnv("AI_LINK_CF_ACCESS_TEST_JWT", "");
  const cfAccessEmail = readEnv("AI_LINK_CF_ACCESS_TEST_EMAIL", "");
  if (target.attachServiceHeaders && cfAccessJwt) {
    headers["cf-access-jwt-assertion"] = cfAccessJwt;
  }
  if (target.attachServiceHeaders && cfAccessEmail) {
    headers["cf-access-authenticated-user-email"] = cfAccessEmail;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Auth Hub request failed with status ${response.status}.`);
    error.code = "auth_hub_request_failed";
    throw error;
  }
  return data;
}

export async function runExecutorOnce({
  baseUrl,
  token,
  executorId = "local-executor",
  executorSessionId = PROCESS_EXECUTOR_SESSION_ID,
  statePath = "",
  registry
}) {
  const heartbeat = await reportHeartbeat({ baseUrl, token, executorId, executorSessionId, registry });
  await writeState(statePath, {
    executorId,
    baseUrl,
    status: "polling",
    heartbeat
  });
  const lease = await requestJson(`${baseUrl}/api/executor/lease`, {
    token,
    method: "POST",
    body: { executorId, executorSessionId }
  });
  if (!lease.task) {
    await writeState(statePath, {
      executorId,
      baseUrl,
      status: "idle",
      leased: false,
      heartbeat
    });
    return { leased: false };
  }

  await writeState(statePath, {
    executorId,
    baseUrl,
    status: "running_task",
    leased: true,
    taskId: lease.task.id,
    taskStep: lease.task.currentStep,
    heartbeat
  });
  const result = await runTask(lease.task, registry ? { registry } : undefined);
  await requestJson(`${baseUrl}/api/executor/tasks/${lease.task.id}/result`, {
    token,
    method: "POST",
    body: {
      ...result,
      executorId,
      executorSessionId,
      leaseId: lease.task.leaseId || ""
    }
  });
  await writeState(statePath, {
    executorId,
    baseUrl,
    status: "task_reported",
    leased: true,
    taskId: lease.task.id,
    resultStatus: result.status,
    heartbeat
  });
  return { leased: true, taskId: lease.task.id, status: result.status };
}

async function reportHeartbeat({ baseUrl, token, executorId, executorSessionId, registry }) {
  if (!registry) {
    return { status: "skipped", error: "connector_registry_unavailable" };
  }

  try {
    const payload = buildExecutorCapabilityHeartbeat({ executorId, executorSessionId, registry });
    const response = await requestJson(`${baseUrl}/api/executor/heartbeat`, {
      token,
      method: "POST",
      body: payload
    });
    return {
      status: response.accepted === true ? "reported" : "rejected",
      expiresAt: response.expiresAt || null
    };
  } catch (error) {
    return { status: "failed", error: safeErrorCode(error) };
  }
}

async function main() {
  const baseUrl = readEnv("AI_LINK_BASE_URL", "http://localhost:10000").replace(/\/+$/, "");
  const token = readEnv("AI_LINK_EXECUTOR_TOKEN", "dev-executor-token");
  const executorId = readEnv("AI_LINK_EXECUTOR_ID", "local-executor");
  const intervalMs = Number(readEnv("AI_LINK_EXECUTOR_INTERVAL_MS", "10000"));
  const statePath = readEnv("AI_LINK_EXECUTOR_STATE_PATH", "");
  const registry = await loadPrivateConnectorRegistry();

  if (args.has("--once")) {
    const result = await runExecutorOnce({ baseUrl, token, executorId, statePath, registry });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`AI Link local executor polling ${baseUrl}`);
  while (true) {
    try {
      const result = await runExecutorOnce({ baseUrl, token, executorId, statePath, registry });
      if (result.leased) {
        console.log(`[${new Date().toISOString()}] processed ${result.taskId}: ${result.status}`);
      }
    } catch (error) {
      await writeState(statePath, {
        executorId,
        baseUrl,
        status: "error",
        error: safeErrorCode(error)
      });
      console.error(`[${new Date().toISOString()}] executor error: ${safeErrorCode(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("localExecutor.js")) {
  main().catch((error) => {
    console.error(`AI Link executor failed to start: ${safeErrorCode(error)}`);
    process.exit(1);
  });
}

function safeErrorCode(error) {
  const code = String(error?.code || "executor_error");
  return /^[a-z0-9_]{1,80}$/.test(code) ? code : "executor_error";
}
