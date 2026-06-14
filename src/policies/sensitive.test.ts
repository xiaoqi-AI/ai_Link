import test from "node:test";
import assert from "node:assert/strict";
import { scanSensitiveText } from "./sensitive.js";

test("scanSensitiveText blocks common secret shapes", () => {
  const fakeSecret = `sk-${"a".repeat(32)}`;
  const findings = scanSensitiveText(`OPENAI_API_KEY=${fakeSecret}`);
  assert.ok(findings.some((finding) => finding.label === "openai-like-secret"));
  assert.ok(findings.some((finding) => finding.label === "env-secret-assignment"));
});

test("scanSensitiveText allows normal text", () => {
  assert.deepEqual(scanSensitiveText("Please research this public topic."), []);
});
