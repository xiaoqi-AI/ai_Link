import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { runWorkflow, resolveWorkflowStages } from "./index.js";

test("runWorkflow chains configured auto_ops stages", async () => {
  const result = await runWorkflow(DEFAULT_CONFIG, {
    workflow: "auto_ops",
    input: "research public launch ideas",
    dryRun: true
  });

  assert.equal(result.workflow, "auto_ops");
  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].name, "research");
  assert.equal(result.stages[0].result.provider, "grok");
  assert.equal(result.stages[1].name, "article_draft");
  assert.equal(result.stages[1].result.provider, "kimi");
  assert.equal(result.stages[1].inputFrom, "original-and-previous");
  assert.match(result.stages[1].result.output, /dry-run:kimi/);
});

test("resolveWorkflowStages accepts explicit stage selection", () => {
  const stages = resolveWorkflowStages(DEFAULT_CONFIG, "auto_ops", ["article_draft"]);

  assert.deepEqual(stages.map((stage) => stage.name), ["article_draft"]);
  assert.equal(stages[0].task, "auto_ops.article_draft");
});

test("runWorkflow can pass previous stage output to a later stage", async () => {
  const result = await runWorkflow({
    providers: {
      mock: {
        type: "mock",
        model: "mock-echo"
      }
    },
    routes: {
      "demo.first": {
        provider: "mock"
      },
      "demo.second": {
        provider: "mock"
      }
    },
    workflows: {
      demo: {
        stages: [
          {
            name: "first",
            task: "demo.first",
            inputFrom: "original"
          },
          {
            name: "second",
            task: "demo.second",
            inputFrom: "original-and-previous"
          }
        ]
      }
    }
  }, {
    workflow: "demo",
    input: "seed input"
  });

  assert.match(result.stages[1].result.output, /Previous stage outputs/);
  assert.match(result.stages[1].result.output, /task: demo.first/);
});
