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

test("runAiLink dry-runs the configured Doubao provider", async () => {
  const result = await runAiLink(DEFAULT_CONFIG, {
    task: "provider.test",
    provider: "doubao",
    input: "hello",
    dryRun: true
  });

  assert.equal(result.provider, "doubao");
  assert.equal(result.model, "doubao-seed-1-8-251228");
  assert.equal(result.metadata.providerType, "doubao");
  assert.match(result.output, /dry-run:doubao/);
  assert.match(result.output, /ark\.cn-beijing\.volces\.com\/api\/v3\/chat\/completions/);
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

test("runAiLink requires approval for user-approved outbound providers", async () => {
  const config = {
    providers: {
      external: {
        type: "openai-compatible" as const,
        baseUrl: "https://api.example.com/v1",
        model: "example-model",
        apiKey: "test-key"
      }
    },
    routes: {
      "demo.research": {
        provider: "external",
        policy: "default"
      }
    },
    policies: {
      default: {
        allowOutbound: "user-approved" as const
      }
    }
  };

  const dryRun = await runAiLink(config, {
    task: "demo.research",
    input: "preview",
    dryRun: true
  });
  assert.equal(dryRun.approval?.reason, "Outbound provider calls require user approval.");
  assert.equal(dryRun.approval?.enforced, false);

  await assert.rejects(
    () => runAiLink(config, {
      task: "demo.research",
      input: "execute"
    }),
    /requires policy approval/
  );
});

test("runAiLink blocks outbound providers when policy disallows outbound", async () => {
  const config = {
    providers: {
      external: {
        type: "openai-compatible" as const,
        baseUrl: "https://api.example.com/v1",
        model: "example-model",
        apiKey: "test-key"
      }
    },
    routes: {
      "demo.offline": {
        provider: "external",
        policy: "offline"
      }
    },
    policies: {
      offline: {
        allowOutbound: "never" as const
      }
    }
  };

  await assert.rejects(
    () => runAiLink(config, {
      task: "demo.offline",
      input: "execute",
      approvePolicy: true
    }),
    /blocked by outbound policy/
  );
});

test("runAiLink enforces provider type policy and can fall back to an allowed provider", async () => {
  const config = {
    providers: {
      grok: {
        type: "grok" as const,
        baseUrl: "https://api.x.ai/v1",
        model: "grok-test",
        apiKey: "test-key"
      },
      mock: {
        type: "mock" as const,
        model: "mock-echo"
      }
    },
    routes: {
      "demo.agent": {
        provider: "grok",
        fallback: ["mock"],
        policy: "external_action"
      }
    },
    policies: {
      external_action: {
        allowedProviderTypes: ["coze" as const, "mock" as const],
        allowOutbound: "user-approved" as const
      }
    }
  };

  const result = await runAiLink(config, {
    task: "demo.agent",
    input: "preview",
    dryRun: true
  });

  assert.equal(result.provider, "mock");
  assert.equal(result.attempts[0].ok, false);
  assert.match(result.attempts[0].error ?? "", /blocked by policy/);
  assert.deepEqual(result.metadata.policyAuditTags, []);

  await assert.rejects(
    () => runAiLink(config, {
      task: "demo.agent",
      provider: "grok",
      input: "preview",
      dryRun: true
    }),
    /blocked by policy/
  );
});

test("runAiLink exposes policy audit metadata", async () => {
  const config = {
    providers: {
      mock: {
        type: "mock" as const,
        model: "mock-echo"
      }
    },
    routes: {
      "demo.local": {
        provider: "mock",
        policy: "local_only"
      }
    },
    policies: {
      local_only: {
        allowOutbound: "never" as const,
        auditTags: ["local-only", "no-outbound"],
        dataClass: "internal" as const
      }
    }
  };

  const result = await runAiLink(config, {
    task: "demo.local",
    input: "safe local task"
  });

  assert.equal(result.metadata.policy, "local_only");
  assert.equal(result.metadata.policyDataClass, "internal");
  assert.deepEqual(result.metadata.policyAuditTags, ["local-only", "no-outbound"]);
  assert.equal(result.metadata.allowOutbound, "never");
  assert.equal(result.metadata.providerType, "mock");
});

test("runAiLink enforces policy model patterns and can fall back", async () => {
  const config = {
    providers: {
      grok: {
        type: "grok" as const,
        baseUrl: "https://api.x.ai/v1",
        model: "grok-expensive",
        apiKey: "test-key"
      },
      mock: {
        type: "mock" as const,
        model: "mock-echo"
      }
    },
    routes: {
      "demo.research": {
        provider: "grok",
        fallback: ["mock"],
        policy: "controlled"
      }
    },
    policies: {
      controlled: {
        allowedModels: ["grok-approved", "mock-*"]
      }
    }
  };

  const result = await runAiLink(config, {
    task: "demo.research",
    input: "preview",
    dryRun: true
  });

  assert.equal(result.provider, "mock");
  assert.equal(result.attempts[0].ok, false);
  assert.match(result.attempts[0].error ?? "", /Model "grok-expensive" is blocked/);

  await assert.rejects(
    () => runAiLink(config, {
      task: "demo.research",
      provider: "grok",
      input: "preview",
      dryRun: true
    }),
    /Model "grok-expensive" is blocked/
  );
});

test("runAiLink enforces policy budget and exposes usage estimates", async () => {
  const config = {
    providers: {
      external: {
        type: "openai-compatible" as const,
        baseUrl: "https://api.example.com/v1",
        model: "approved-model",
        apiKey: "test-key",
        requestDefaults: {
          max_tokens: 1000
        },
        pricing: {
          inputUsdPer1M: 10,
          outputUsdPer1M: 20
        }
      },
      mock: {
        type: "mock" as const,
        model: "mock-echo"
      }
    },
    routes: {
      "demo.costly": {
        provider: "external",
        fallback: ["mock"],
        policy: "budgeted"
      }
    },
    policies: {
      budgeted: {
        allowedModels: ["approved-model", "mock-*"],
        budget: {
          maxInputTokens: 1000,
          maxOutputTokens: 1500,
          maxEstimatedCostUsd: 0.01
        }
      }
    }
  };

  const result = await runAiLink(config, {
    task: "demo.costly",
    input: "this input is long enough to exceed the tiny budget",
    dryRun: true
  });

  assert.equal(result.provider, "mock");
  assert.match(result.attempts[0].error ?? "", /exceeds policy budget/);
  assert.equal(result.metadata.policyBudget && typeof result.metadata.policyBudget === "object", true);
  assert.equal(result.metadata.usageEstimate && typeof result.metadata.usageEstimate === "object", true);

  await assert.rejects(
    () => runAiLink(config, {
      task: "demo.costly",
      provider: "external",
      input: "this input is long enough to exceed the tiny budget",
      dryRun: true
    }),
    /exceeds policy budget/
  );
});
