import test from "node:test";
import assert from "node:assert/strict";
import {
  draftRoutesFromNaturalLanguage,
  draftSkillConfigFromNaturalLanguage
} from "./naturalLanguage.js";

test("draftRoutesFromNaturalLanguage keeps provider stages separated by clauses", () => {
  const draft = draftRoutesFromNaturalLanguage({
    skillName: "auto_ops",
    description: "调研阶段用 Grok，文章初稿用 Kimi，扣子负责工作流，Codex 负责落地"
  });

  assert.equal(draft.routes?.["auto_ops.research"]?.provider, "grok");
  assert.equal(draft.routes?.["auto_ops.article_draft"]?.provider, "kimi");
  assert.equal(draft.routes?.["auto_ops.agent_flow"]?.provider, "coze");
  assert.equal(draft.routes?.["auto_ops.general"], undefined);
});

test("draftSkillConfigFromNaturalLanguage adds a workflow in clause order", () => {
  const draft = draftSkillConfigFromNaturalLanguage({
    skillName: "auto_ops",
    description: "文章初稿用 Kimi，调研阶段用 Grok，扣子负责工作流，Codex 负责落地"
  });

  assert.equal(draft.routes?.["auto_ops.research"]?.provider, "grok");
  assert.equal(draft.routes?.["auto_ops.article_draft"]?.provider, "kimi");
  assert.equal(draft.workflows?.auto_ops?.description?.includes("Kimi"), true);
  assert.deepEqual(
    draft.workflows?.auto_ops?.stages?.map((stage) => [stage.name, stage.task, stage.inputFrom]),
    [
      ["article_draft", "auto_ops.article_draft", "original"],
      ["research", "auto_ops.research", "original-and-previous"],
      ["agent_flow", "auto_ops.agent_flow", "original-and-previous"]
    ]
  );
});
