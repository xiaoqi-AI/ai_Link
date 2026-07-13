import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicAuditEvent } from "../src/security/redact.js";
import { auditPage, connectorsPage, taskPage } from "../src/ui/html.js";

describe("console task detail page", () => {
  it("separates contract, executor heartbeat, and real-platform evidence", () => {
    const html = connectorsPage({
      connectors: [{
        platform: "xiaohongshu",
        status: "reserved",
        mode: "reserved",
        capabilities: [],
        issues: []
      }],
      issues: [],
      executorRuntime: {
        summary: { online: 1, stale: 0, total: 1 },
        executors: [{
          executorId: "local-executor",
          status: "online",
          lastSeenAt: "2026-07-12T12:00:00.000Z",
          expiresAt: "2026-07-12T12:01:00.000Z"
        }],
        connectors: [{
          platform: "xiaohongshu",
          status: "available",
          mode: "private",
          source: "executor",
          runtime: { status: "online" },
          canRunReal: false
        }]
      },
      authStatus: {
        items: [{
          platform: "xiaohongshu",
          status: "unverified",
          reason: "probe_not_run",
          action: "能力已加载，尚未完成只读健康检查",
          relatedTaskIds: []
        }],
        nextActions: []
      }
    });

    assert.match(html, /连接器契约基线/);
    assert.match(html, /本机执行器状态/);
    assert.match(html, /执行器能力证据/);
    assert.match(html, /真实可运行/);
    assert.match(html, /未验证/);
    assert.match(html, /local-executor/);
  });

  it("renders AI Link audit summaries as scan-friendly tables", () => {
    const html = taskPage({
      task: {
        id: "12345678-1234-1234-1234-123456789abc",
        workflow: "read_detect",
        status: "completed",
        currentStep: "done",
        updatedAt: "2026-06-15T00:00:00.000Z",
        summary: "done",
        result: {
          aiLinkAudit: {
            kind: "run",
            task: "auto_ops.research",
            provider: "grok",
            providerType: "grok",
            model: "grok-4.3",
            policy: "default",
            policyBudget: { maxInputTokens: 12000, maxOutputTokens: 3000 },
            usageEstimate: { inputTokens: 10, outputTokens: 20 },
            approval: { required: true, approved: false, mode: "live" }
          }
        }
      },
      approvals: [],
      artifacts: [],
      auditEvents: [
        publicAuditEvent({
          id: "event-1",
          taskId: "12345678-1234-1234-1234-123456789abc",
          actor: "codex",
          eventType: "ai_link.audit",
          createdAt: "2026-06-15T00:00:00.000Z",
          detail: {
            status: "submitted",
            recordId: "record-1",
            audit: {
              kind: "workflow",
              stages: [
                {
                  name: "research",
                  result: {
                    kind: "run",
                    task: "auto_ops.research",
                    provider: "grok",
                    model: "grok-4.3",
                    policy: "default",
                    usageEstimate: { inputTokens: 10, outputTokens: 20 },
                    rawSecret: "drop-me"
                  }
                }
              ]
            }
          }
        })
      ]
    });

    assert.match(html, /AI Link Audit/);
    assert.match(html, /AI Link 审计摘要/);
    assert.match(html, /<th>Provider<\/th>/);
    assert.match(html, /grok/);
    assert.match(html, /grok-4\.3/);
    assert.match(html, /default/);
    assert.match(html, /research \/ auto_ops\.research/);
    assert.equal(html.includes("drop-me"), false);
  });

  it("renders the audit log with filters and AI Link summaries", () => {
    const html = auditPage({
      filters: {
        taskId: "12345678-1234-1234-1234-123456789abc",
        eventType: "ai_link.audit",
        limit: 25
      },
      auditEvents: [
        publicAuditEvent({
          id: "event-1",
          taskId: "12345678-1234-1234-1234-123456789abc",
          actor: "codex",
          eventType: "ai_link.audit",
          createdAt: "2026-06-15T00:00:00.000Z",
          detail: {
            status: "submitted",
            recordId: "record-1",
            audit: {
              kind: "run",
              task: "auto_ops.research",
              provider: "grok",
              model: "grok-4.3",
              policy: "default",
              usageEstimate: { inputTokens: 10, outputTokens: 20 },
              rawSecret: "drop-me"
            }
          }
        })
      ]
    });

    assert.match(html, /审计日志/);
    assert.match(html, /value="12345678-1234-1234-1234-123456789abc"/);
    assert.match(html, /value="ai_link\.audit" selected/);
    assert.match(html, /value="25"/);
    assert.match(html, /AI Link 审计摘要/);
    assert.match(html, /grok-4\.3/);
    assert.match(html, /record-1/);
    assert.equal(html.includes("drop-me"), false);
  });
});
