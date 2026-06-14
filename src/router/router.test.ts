import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { runAiLink } from "./index.js";

test("runAiLink dry-runs the configured Grok route", async () => {
  const result = await runAiLink(DEFAULT_CONFIG, {
    task: "auto_ops.research",
    input: "research a public topic",
    dryRun: true
  });

  assert.equal(result.provider, "grok");
  assert.equal(result.model, "grok-4.3");
  assert.match(result.output, /dry-run:grok/);
});

test("runAiLink can use the local mock provider", async () => {
  const result = await runAiLink(DEFAULT_CONFIG, {
    task: "unknown.task",
    input: "hello"
  });

  assert.equal(result.provider, "mock");
  assert.match(result.output, /mock\/local-dry-run/);
});

test("runAiLink enforces route policy approval", async () => {
  const config = {
    providers: {
      mock: {
        type: "mock" as const,
        model: "mock-echo"
      }
    },
    routes: {
      "demo.agent": {
        provider: "mock",
        policy: "external_action"
      }
    },
    policies: {
      external_action: {
        approval: {
          required: true,
          mode: "live" as const,
          reason: "External action needs review."
        }
      }
    }
  };

  const dryRun = await runAiLink(config, {
    task: "demo.agent",
    input: "preview",
    dryRun: true
  });
  assert.equal(dryRun.approval?.enforced, false);

  await assert.rejects(
    () => runAiLink(config, {
      task: "demo.agent",
      input: "execute"
    }),
    /requires policy approval/
  );

  const approved = await runAiLink(config, {
    task: "demo.agent",
    input: "execute",
    approvePolicy: true
  });

  assert.equal(approved.approval?.approved, true);
  assert.equal(approved.approval?.enforced, true);
});
