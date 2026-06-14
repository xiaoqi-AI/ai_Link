import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "./defaults.js";
import { validateConfig } from "./validate.js";

test("validateConfig accepts the default configuration", () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

test("validateConfig catches missing route providers", () => {
  const issues = validateConfig({
    providers: {
      mock: {
        type: "mock"
      }
    },
    routes: {
      "bad.route": {
        provider: "missing"
      }
    }
  });

  assert.ok(issues.some((issue) => issue.severity === "error"));
  assert.ok(issues.some((issue) => issue.path === "routes.bad.route.provider"));
});

test("validateConfig warns on inline apiKey", () => {
  const issues = validateConfig({
    providers: {
      risky: {
        type: "openai-compatible",
        baseUrl: "https://api.example.com/v1",
        model: "example",
        apiKey: "inline-value"
      }
    }
  });

  assert.ok(issues.some((issue) => issue.severity === "warning" && issue.path === "providers.risky.apiKey"));
});

test("validateConfig catches workflow stages without routes", () => {
  const issues = validateConfig({
    providers: {
      mock: {
        type: "mock"
      }
    },
    routes: {},
    workflows: {
      auto_ops: {
        stages: [
          {
            name: "research",
            task: "auto_ops.research"
          }
        ]
      }
    }
  });

  assert.ok(issues.some((issue) => issue.severity === "error"));
  assert.ok(issues.some((issue) => issue.path === "workflows.auto_ops.stages.0.task"));
});
