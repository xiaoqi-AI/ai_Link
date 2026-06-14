import test from "node:test";
import assert from "node:assert/strict";
import { cozeProvider } from "./coze.js";

test("coze provider dry-runs without a configured command", async () => {
  const result = await cozeProvider.run({
    providerName: "coze",
    provider: {
      type: "coze",
      model: "coze-agent-workflow"
    },
    request: {
      task: "auto_ops.agent_flow",
      input: "public workflow brief"
    },
    model: "coze-agent-workflow",
    dryRun: true
  });

  assert.match(result.output, /dry-run:coze/);
  assert.equal(result.metadata.commandConfigured, false);
});

test("coze provider sends a redacted JSON payload to a local command", async () => {
  const script = [
    "let raw='';",
    "process.stdin.on('data', chunk => raw += chunk);",
    "process.stdin.on('end', () => {",
    "  const payload = JSON.parse(raw);",
    "  process.stdout.write(JSON.stringify({ output: `agent:${payload.task}:${payload.input}` }));",
    "});"
  ].join("");

  const result = await cozeProvider.run({
    providerName: "coze",
    provider: {
      type: "coze",
      model: "coze-agent-workflow",
      command: process.execPath,
      args: ["-e", script]
    },
    request: {
      task: "auto_ops.agent_flow",
      input: "public workflow brief"
    },
    model: "coze-agent-workflow",
    dryRun: false
  });

  assert.equal(result.output, "agent:auto_ops.agent_flow:public workflow brief");
  assert.equal(result.metadata.providerType, "coze");
});

test("coze provider extracts output from NDJSON agent events", async () => {
  const script = [
    "process.stdout.write(JSON.stringify({ event: 'reply_update', content: 'draft' }) + '\\n');",
    "process.stdout.write(JSON.stringify({ event: 'reply_completed', content: 'final agent reply' }) + '\\n');"
  ].join("");

  const result = await cozeProvider.run({
    providerName: "coze",
    provider: {
      type: "coze",
      model: "coze-agent-workflow",
      command: process.execPath,
      args: ["-e", script]
    },
    request: {
      task: "auto_ops.agent_flow",
      input: "public workflow brief"
    },
    model: "coze-agent-workflow",
    dryRun: false
  });

  assert.equal(result.output, "final agent reply");
  assert.equal(Array.isArray(result.raw), true);
});
