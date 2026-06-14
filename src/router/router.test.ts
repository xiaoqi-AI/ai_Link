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
