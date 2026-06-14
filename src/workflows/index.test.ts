import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolveWorkflowStages, runWorkflow } from "./index.js";

test("resolveWorkflowStages uses configured default stages", () => {
  const stages = resolveWorkflowStages(DEFAULT_CONFIG, "auto_ops");

  assert.deepEqual(
    stages.map((stage) => [stage.name, stage.task, stage.inputFrom]),
    [
      ["research", "auto_ops.research", "original"],
      ["article_draft", "auto_ops.article_draft", "original-and-previous"],
      ["agent_flow", "auto_ops.agent_flow", "original-and-previous"]
    ]
  );
});

test("runWorkflow dry-runs configured stages in order", async () => {
  const result = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    input: "write about public AI tooling",
    dryRun: true
  });

  assert.equal(result.workflow, "auto_ops");
  assert.equal(result.dryRun, true);
  assert.equal(result.stages.length, 3);
  assert.equal(result.stages[0].name, "research");
  assert.match(result.stages[0].result.output, /\[dry-run:grok]/);
  assert.equal(result.stages[1].name, "article_draft");
  assert.match(result.stages[1].result.output, /\[dry-run:kimi]/);
  assert.equal(result.stages[2].name, "agent_flow");
  assert.match(result.stages[2].result.output, /\[dry-run:coze]/);
});

test("runWorkflow resumes after previous stages", async () => {
  const seed = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    stages: ["research"],
    input: "research first",
    dryRun: true
  });

  const result = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    previousStages: seed.stages,
    resumeFromRecordId: "seed-record",
    input: "continue from seed",
    dryRun: true
  });

  assert.equal(result.resume?.fromRecordId, "seed-record");
  assert.equal(result.resume?.startAtStage, "article_draft");
  assert.equal(result.resume?.previousStageCount, 1);
  assert.deepEqual(
    result.stages.map((stage) => [stage.name, stage.source]),
    [
      ["research", "resume"],
      ["article_draft", "current"],
      ["agent_flow", "current"]
    ]
  );
});

test("runWorkflow can rerun from a selected stage", async () => {
  const seed = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    input: "full seed",
    dryRun: true
  });

  const result = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    previousStages: seed.stages,
    startAtStage: "article_draft",
    input: "rerun draft",
    dryRun: true
  });

  assert.equal(result.resume?.startAtStage, "article_draft");
  assert.deepEqual(
    result.stages.map((stage) => [stage.name, stage.source]),
    [
      ["research", "resume"],
      ["article_draft", "current"],
      ["agent_flow", "current"]
    ]
  );
});

test("runWorkflow requires explicit approval before approved stages", async () => {
  const config = {
    providers: {
      mock: {
        type: "mock" as const,
        model: "mock-echo"
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
              mode: "always" as const,
              reason: "Publishing needs human approval."
            }
          }
        ]
      }
    }
  };

  await assert.rejects(
    () => runWorkflow(config, {
      workflow: "demo",
      input: "publish this"
    }),
    /requires approval/
  );

  const result = await runWorkflow(config, {
    workflow: "demo",
    input: "publish this",
    approvedStages: ["publish"]
  });

  assert.equal(result.stages[0].approval?.approved, true);
  assert.equal(result.stages[0].approval?.enforced, true);
  assert.match(result.stages[0].result.output, /task: demo.publish/);
});

test("runWorkflow only warns for live approvals during dry-run", async () => {
  const result = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    dryRun: true
  });

  const agentStage = result.stages.find((stage) => stage.name === "agent_flow");
  assert.equal(agentStage?.approval?.mode, "live");
  assert.equal(agentStage?.approval?.enforced, false);
  assert.equal(agentStage?.approval?.approved, false);
});
