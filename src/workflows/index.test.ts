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
