import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { describeConnectorRegistry, validateConnectorRegistry } from "../src/connectors/contracts.js";
import {
  PLATFORM_AUTH_OPERATIONS,
  normalizePlatformConnectorResult
} from "../src/connectors/platformAuthContracts.js";
import { loadPrivateConnectorRegistry } from "../src/connectors/privateLoader.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import { validateTaskInput } from "../src/domain/workflow.js";
import { runTask } from "../src/executor/runTask.js";
import { redact } from "../src/security/redact.js";

const CHECKED_AT = "2026-07-11T08:00:00.000Z";

function readyXhsResult(items = [xhsItem()]) {
  return {
    status: "ready",
    session: {
      state: "valid",
      checked_at: CHECKED_AT
    },
    items,
    action_required: null,
    diagnostics: {
      item_count: items.length,
      duration_ms: 125,
      raw_response: "must-not-leave-private-boundary"
    },
    cookie: "must-not-leave-private-boundary"
  };
}

function xhsItem() {
  return {
    source_platform: "xiaohongshu",
    source_url: "https://www.xiaohongshu.com/explore/note123?xsec_token=private-value&xsec_source=pc_search#private",
    title: "公开标题",
    summary: "有限长度公开摘要",
    published_at: "",
    acquisition_provider: "ai_link_xhs_readonly",
    source_reachability: {
      status: "verified",
      method: "authenticated_search"
    },
    rawHtml: "<html>private</html>"
  };
}

function maliciousItem(platform) {
  return {
    source_platform: platform,
    source_url: platform === "xiaohongshu"
      ? "https://www.xiaohongshu.com/explore/injected-note"
      : "https://attacker.example/injected-result",
    title: "attacker-controlled title",
    summary: "attacker-controlled summary",
    published_at: "",
    acquisition_provider: platform === "xiaohongshu"
      ? "ai_link_xhs_readonly"
      : "private_connector",
    source_reachability: {
      status: "verified",
      method: "private_connector_claim"
    }
  };
}

function privateXhsConnector(readContent) {
  return {
    mode: "private",
    checkSession: async () => readyXhsResult([]),
    beginLogin: async () => ({
      status: "needs_action",
      session: { state: "missing", checked_at: CHECKED_AT },
      items: [],
      action_required: { code: "login_required" },
      diagnostics: { item_count: 0 }
    }),
    readContent
  };
}

describe("platform authorization connector contracts", () => {
  it("publishes required session capabilities without exposing connector instances", () => {
    const summary = describeConnectorRegistry(createConnectorRegistry());
    const xhs = summary.connectors.find((connector) => connector.platform === "xiaohongshu");
    const github = summary.connectors.find((connector) => connector.platform === "github");

    assert.equal(xhs.status, "reserved");
    assert.equal(xhs.mode, "reserved");
    assert.deepEqual(
      xhs.capabilities.filter((capability) => capability.required).map((capability) => capability.name),
      ["check_session", "begin_login", "read_content"]
    );
    assert.equal(typeof xhs.checkSession, "undefined");
    assert.equal(github.status, "available");
    assert.equal(github.mode, "mock");
    assert.deepEqual(
      github.capabilities.filter((capability) => capability.required).map((capability) => capability.name),
      ["check_auth"]
    );
  });

  it("reports a stable contract error when a private connector misses a required method", () => {
    const registry = createConnectorRegistry({
      privateConnectors: {
        xiaohongshu: {
          mode: "private",
          checkSession: async () => ({}),
          readContent: async () => ({})
        }
      }
    });
    const issues = validateConnectorRegistry(registry);

    assert.equal(
      issues.some((issue) =>
        issue.platform === "xiaohongshu"
        && issue.code === "connector_contract_failed"
        && issue.capability === "begin_login"
      ),
      true
    );
  });

  it("normalizes a successful Xiaohongshu result through an allowlist", () => {
    const normalized = normalizePlatformConnectorResult(readyXhsResult(), {
      platform: "xiaohongshu",
      operation: "search_content"
    });
    const serialized = JSON.stringify(normalized);

    assert.equal(normalized.status, "ready");
    assert.equal(normalized.items[0].source_url, "https://www.xiaohongshu.com/explore/note123");
    assert.equal(normalized.diagnostics.item_count, 1);
    assert.equal(normalized.diagnostics.duration_ms, 125);
    assert.equal(serialized.includes("private-value"), false);
    assert.equal(serialized.includes("must-not-leave-private-boundary"), false);
    assert.equal(serialized.includes("rawHtml"), false);
  });

  it("fails closed when any non-search operation returns injected items", () => {
    for (const [platform, operations] of Object.entries(PLATFORM_AUTH_OPERATIONS)) {
      for (const operation of Object.keys(operations)) {
        if (platform === "xiaohongshu" && operation === "search_content") continue;

        assert.throws(
          () => normalizePlatformConnectorResult({
            status: "ready",
            session: { state: "valid", checked_at: CHECKED_AT },
            items: [maliciousItem(platform)]
          }, { platform, operation }),
          (error) =>
            error.code === "connector_contract_failed"
            && error.reason === "items_not_allowed_for_operation",
          `${platform}/${operation} must reject private connector items`
        );
      }
    }
  });

  it("runs a private read-only search and preserves only public session status", async () => {
    const registry = createConnectorRegistry({
      privateConnectors: {
        xiaohongshu: privateXhsConnector(async () => readyXhsResult())
      }
    });
    const result = await runTask({
      workflow: "platform_auth_collect",
      currentStep: "process",
      input: {
        platform: "xiaohongshu",
        operation: "search_content",
        query: "育儿热点",
        sort: "latest",
        limit: 1,
        mode: "read_only"
      }
    }, { registry });

    assert.equal(result.status, "completed");
    assert.equal(result.result.status, "ready");
    assert.deepEqual(result.result.session, { state: "valid", checked_at: CHECKED_AT });
    assert.equal(result.result.items.length, 1);
    assert.equal(JSON.stringify(result).includes("xsec_token"), false);
  });

  it("maps an expired login to a stable needs_action response", async () => {
    const registry = createConnectorRegistry({
      privateConnectors: {
        xiaohongshu: privateXhsConnector(async () => ({
          status: "needs_action",
          session: { state: "expired", checked_at: CHECKED_AT, token: "private" },
          items: [],
          action_required: {
            code: "login_expired",
            action: "open C:\\private\\profile",
            retryable: false
          },
          diagnostics: { item_count: 0, raw_response: "private" }
        }))
      }
    });
    const result = await runTask({
      workflow: "platform_auth_collect",
      input: {
        platform: "xiaohongshu",
        operation: "search_content",
        query: "育儿热点",
        sort: "latest",
        limit: 1,
        mode: "read_only"
      }
    }, { registry });

    assert.equal(result.status, "needs_action");
    assert.equal(result.error.code, "login_expired");
    assert.equal(result.error.action, "renew_login_in_local_browser");
    assert.equal(result.error.retryable, true);
    assert.equal(JSON.stringify(result).includes("C:\\private"), false);
  });

  it("does not invoke interactive login before the P0.2 human gate is approved", async () => {
    let beginLoginCalled = false;
    const registry = createConnectorRegistry({
      privateConnectors: {
        xiaohongshu: {
          mode: "private",
          checkSession: async () => readyXhsResult([]),
          beginLogin: async () => {
            beginLoginCalled = true;
            return {
              status: "needs_action",
              session: { state: "missing", checked_at: CHECKED_AT },
              items: [],
              action_required: { code: "login_required" }
            };
          },
          readContent: async () => readyXhsResult()
        }
      }
    });
    const result = await runTask({
      workflow: "platform_auth_collect",
      input: {
        platform: "xiaohongshu",
        operation: "begin_login"
      }
    }, { registry });

    assert.equal(result.status, "needs_approval");
    assert.equal(result.approval.type, "platform_interactive_login");
    assert.equal(result.result.approval_required.code, "interactive_approval_required");
    assert.equal(beginLoginCalled, false);
  });

  it("closes a false ready result when no specific content URL exists", async () => {
    const registry = createConnectorRegistry({
      privateConnectors: {
        xiaohongshu: privateXhsConnector(async () => readyXhsResult([]))
      }
    });
    const result = await runTask({
      workflow: "platform_auth_collect",
      input: {
        platform: "xiaohongshu",
        operation: "search_content",
        query: "育儿热点",
        sort: "latest",
        limit: 1,
        mode: "read_only"
      }
    }, { registry });

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "specific_content_missing");
    assert.equal(result.result.status, "blocked");
  });

  it("accepts only the approved read-only workflow inputs", () => {
    const parsed = validateTaskInput({
      workflow: "platform_auth_collect",
      input: {
        platform: "xiaohongshu",
        operation: "search_content",
        query: "育儿热点",
        sort: "latest",
        limit: 4,
        mode: "read_only",
        cookie: "drop-me"
      },
      targets: ["toutiao"]
    });
    const denied = validateTaskInput({
      workflow: "platform_auth_collect",
      input: { platform: "xiaohongshu", operation: "publish" }
    });
    const probe = validateTaskInput({
      workflow: "platform_auth_collect",
      input: {
        platform: "github",
        operation: "check_auth",
        owner: "xiaoqi-AI",
        repo: "ai_Link",
        scope: "repo_read"
      },
      options: { evidenceIntent: "connector_probe" }
    });
    const deniedSearchProbe = validateTaskInput({
      workflow: "platform_auth_collect",
      input: { platform: "xiaohongshu", operation: "search_content", query: "育儿热点" },
      options: { evidenceIntent: "connector_probe" }
    });
    const missingGitHubTarget = validateTaskInput({
      workflow: "platform_auth_collect",
      input: { platform: "github", operation: "check_auth", scope: "actions_read" }
    });
    const partialGitHubTarget = validateTaskInput({
      workflow: "platform_auth_collect",
      input: { platform: "github", operation: "check_auth", owner: "xiaoqi-AI" }
    });

    assert.equal(parsed.error, undefined);
    assert.deepEqual(parsed.targets, ["xiaohongshu"]);
    assert.equal(parsed.input.cookie, undefined);
    assert.equal(denied.error, "unsupported_platform_operation");
    assert.equal(probe.options.evidenceIntent, "connector_probe");
    assert.equal(deniedSearchProbe.error, "unsupported_probe_operation");
    assert.equal(missingGitHubTarget.error, "github_repository_required");
    assert.equal(partialGitHubTarget.error, "github_repository_required");
  });

  it("runs a GitHub authorization check through the P0.2 platform auth workflow", async () => {
    const result = await runTask({
      workflow: "platform_auth_collect",
      input: {
        platform: "github",
        operation: "check_auth",
        owner: "xiaoqi-AI",
        repo: "ai_Link",
        scope: "repo_read"
      }
    }, { registry: createConnectorRegistry() });

    assert.equal(result.status, "completed");
    assert.equal(result.summary, "GitHub 授权检查通过。");
    assert.equal(result.result.platform, "github");
    assert.equal(result.result.operation, "check_auth");
    assert.equal(result.result.session.state, "valid");
  });

  it("maps GitHub credential issues to public-safe next actions", async () => {
    const registry = createConnectorRegistry({
      privateConnectors: {
        github: {
          mode: "private",
          checkAuth: async () => ({
            status: "needs_action",
            session: {
              state: "missing",
              checked_at: CHECKED_AT,
              credential: "private-github-marker"
            },
            items: [],
            action_required: {
              code: "credential_missing",
              action: "configure GH_TOKEN in private env",
              retryable: true
            },
            diagnostics: {
              item_count: 0,
              raw_response: "private-github-response"
            }
          })
        }
      }
    });
    const result = await runTask({
      workflow: "platform_auth_collect",
      input: {
        platform: "github",
        operation: "check_auth",
        owner: "xiaoqi-AI",
        repo: "ai_Link"
      }
    }, { registry });

    assert.equal(result.status, "needs_action");
    assert.equal(result.error.code, "credential_missing");
    assert.equal(result.error.action, "configure_official_api_credentials");
    assert.equal(JSON.stringify(result).includes("private-github-marker"), false);
    assert.equal(JSON.stringify(result).includes("private-github-response"), false);
    assert.equal(JSON.stringify(result).includes("GH_TOKEN"), false);
  });

  it("loads private connectors only from runtime/private", async () => {
    const workspaceRoot = process.cwd();
    const privateRoot = path.join(workspaceRoot, "runtime", "private");
    const modulePath = path.join(privateRoot, `platform-auth-test-${process.pid}-${Date.now()}.mjs`);
    await mkdir(privateRoot, { recursive: true });
    await writeFile(modulePath, `
      export async function createPrivateConnectors() {
        return {
          xiaohongshu: {
            checkSession: async () => ({}),
            beginLogin: async () => ({}),
            readContent: async () => ({})
          }
        };
      }
    `, "utf8");

    try {
      const registry = await loadPrivateConnectorRegistry({ modulePath, workspaceRoot });
      const summary = describeConnectorRegistry(registry);
      const xhs = summary.connectors.find((connector) => connector.platform === "xiaohongshu");
      assert.equal(xhs.status, "available");
      assert.equal(xhs.mode, "private");
    } finally {
      await rm(modulePath, { force: true });
    }

    await assert.rejects(
      loadPrivateConnectorRegistry({
        modulePath: path.join(workspaceRoot, "src", "connectors", "registry.js"),
        workspaceRoot
      }),
      (error) =>
        error.code === "connector_contract_failed"
        && error.reason === "private_module_outside_runtime_private"
        && !error.message.includes(workspaceRoot)
    );
  });

  it("hides asynchronous private connector factory failures", async () => {
    const workspaceRoot = process.cwd();
    const privateRoot = path.join(workspaceRoot, "runtime", "private");
    const modulePath = path.join(privateRoot, `platform-auth-failure-${process.pid}-${Date.now()}.mjs`);
    await mkdir(privateRoot, { recursive: true });
    await writeFile(modulePath, `
      export async function createPrivateConnectors() {
        throw new Error("private factory details must stay local");
      }
    `, "utf8");

    try {
      await assert.rejects(
        loadPrivateConnectorRegistry({ modulePath, workspaceRoot }),
        (error) =>
          error.code === "connector_contract_failed"
          && error.reason === "private_connector_module_unavailable"
          && !error.message.includes("private factory details")
          && !error.message.includes(workspaceRoot)
      );
    } finally {
      await rm(modulePath, { force: true });
    }
  });

  it("keeps the safe session envelope while redacting all session secrets", () => {
    const value = redact({
      session: {
        state: "valid",
        checked_at: CHECKED_AT,
        token: "private"
      },
      session_token: "private"
    });

    assert.deepEqual(value.session, { state: "valid", checked_at: CHECKED_AT });
    assert.equal(value.session_token, "[redacted]");
    assert.equal(JSON.stringify(value).includes("private"), false);
  });
});
