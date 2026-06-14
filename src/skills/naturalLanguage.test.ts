import test from "node:test";
import assert from "node:assert/strict";
import { draftRoutesFromNaturalLanguage } from "./naturalLanguage.js";

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
