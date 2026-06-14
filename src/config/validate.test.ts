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

test("validateConfig warns on provider command", () => {
  const issues = validateConfig({
    providers: {
      cozeLocal: {
        type: "coze",
        model: "coze-agent-workflow",
        command: "coze"
      }
    }
  });

  assert.ok(issues.some((issue) => issue.severity === "warning" && issue.path === "providers.cozeLocal.command"));
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

test("validateConfig catches invalid workflow approval modes", () => {
  const issues = validateConfig({
    providers: {
      mock: {
        type: "mock"
      }
    },
    routes: {
      "demo.publish": {
        provider: "mock"
      }
    },
    workflows: {
      demo: {
        stages: [
          {
            name: "publish",
            task: "demo.publish",
            approval: {
              required: true,
              mode: "sometimes"
            }
          }
        ]
      }
    }
  } as unknown as Parameters<typeof validateConfig>[0]);

  assert.ok(issues.some((issue) => issue.severity === "error"));
  assert.ok(issues.some((issue) => issue.path === "workflows.demo.stages.0.approval.mode"));
});

test("validateConfig catches invalid policy approval modes", () => {
  const issues = validateConfig({
    policies: {
      external_action: {
        approval: {
          required: true,
          mode: "sometimes"
        }
      }
    }
  } as unknown as Parameters<typeof validateConfig>[0]);

  assert.ok(issues.some((issue) => issue.severity === "error"));
  assert.ok(issues.some((issue) => issue.path === "policies.external_action.approval.mode"));
});
