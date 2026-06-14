#!/usr/bin/env node
import { runTask } from "./runTask.js";

const args = new Set(process.argv.slice(2));

function readEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

async function requestJson(url, { token, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
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
  executorId = "local-executor"
}) {
  const lease = await requestJson(`${baseUrl}/api/executor/lease`, {
    token,
    method: "POST",
    body: { executorId }
  });
  if (!lease.task) {
    return { leased: false };
  }

  const result = await runTask(lease.task);
  await requestJson(`${baseUrl}/api/executor/tasks/${lease.task.id}/result`, {
    token,
    method: "POST",
    body: result
  });
  return { leased: true, taskId: lease.task.id, status: result.status };
}

async function main() {
  const baseUrl = readEnv("AI_LINK_BASE_URL", "http://localhost:10000").replace(/\/+$/, "");
  const token = readEnv("AI_LINK_EXECUTOR_TOKEN", "dev-executor-token");
  const executorId = readEnv("AI_LINK_EXECUTOR_ID", "local-executor");
  const intervalMs = Number(readEnv("AI_LINK_EXECUTOR_INTERVAL_MS", "10000"));

  if (args.has("--once")) {
    const result = await runExecutorOnce({ baseUrl, token, executorId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`AI Link local executor polling ${baseUrl}`);
  while (true) {
    try {
      const result = await runExecutorOnce({ baseUrl, token, executorId });
      if (result.leased) {
        console.log(`[${new Date().toISOString()}] processed ${result.taskId}: ${result.status}`);
      }
    } catch (error) {
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
