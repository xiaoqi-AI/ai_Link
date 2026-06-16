#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runTask } from "./runTask.js";

const args = new Set(process.argv.slice(2));

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
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`
  };
  const cfAccessClientId = readEnv("CF_ACCESS_CLIENT_ID", "");
  const cfAccessClientSecret = readEnv("CF_ACCESS_CLIENT_SECRET", "");
  if (cfAccessClientId && cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cfAccessClientId;
    headers["CF-Access-Client-Secret"] = cfAccessClientSecret;
  }
  const cfAccessJwt = readEnv("AI_LINK_CF_ACCESS_TEST_JWT", "");
  const cfAccessEmail = readEnv("AI_LINK_CF_ACCESS_TEST_EMAIL", "");
  if (cfAccessJwt) {
    headers["cf-access-jwt-assertion"] = cfAccessJwt;
  }
  if (cfAccessEmail) {
    headers["cf-access-authenticated-user-email"] = cfAccessEmail;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

export async function runExecutorOnce({
  baseUrl,
  token,
  executorId = "local-executor",
  statePath = ""
}) {
  await writeState(statePath, {
    executorId,
    baseUrl,
    status: "polling"
  });
  const lease = await requestJson(`${baseUrl}/api/executor/lease`, {
    token,
    method: "POST",
    body: { executorId }
  });
  if (!lease.task) {
    await writeState(statePath, {
      executorId,
      baseUrl,
      status: "idle",
      leased: false
    });
    return { leased: false };
  }

  await writeState(statePath, {
    executorId,
    baseUrl,
    status: "running_task",
    leased: true,
    taskId: lease.task.id,
    taskStep: lease.task.currentStep
  });
  const result = await runTask(lease.task);
  await requestJson(`${baseUrl}/api/executor/tasks/${lease.task.id}/result`, {
    token,
    method: "POST",
    body: result
  });
  await writeState(statePath, {
    executorId,
    baseUrl,
    status: "task_reported",
    leased: true,
    taskId: lease.task.id,
    resultStatus: result.status
  });
  return { leased: true, taskId: lease.task.id, status: result.status };
}

async function main() {
  const baseUrl = readEnv("AI_LINK_BASE_URL", "http://localhost:10000").replace(/\/+$/, "");
  const token = readEnv("AI_LINK_EXECUTOR_TOKEN", "dev-executor-token");
  const executorId = readEnv("AI_LINK_EXECUTOR_ID", "local-executor");
  const intervalMs = Number(readEnv("AI_LINK_EXECUTOR_INTERVAL_MS", "10000"));
  const statePath = readEnv("AI_LINK_EXECUTOR_STATE_PATH", "");

  if (args.has("--once")) {
    const result = await runExecutorOnce({ baseUrl, token, executorId, statePath });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`AI Link local executor polling ${baseUrl}`);
  while (true) {
    try {
      const result = await runExecutorOnce({ baseUrl, token, executorId, statePath });
      if (result.leased) {
        console.log(`[${new Date().toISOString()}] processed ${result.taskId}: ${result.status}`);
      }
    } catch (error) {
      await writeState(statePath, {
        executorId,
        baseUrl,
        status: "error",
        error: error.message
      });
      console.error(`[${new Date().toISOString()}] executor error: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("localExecutor.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
