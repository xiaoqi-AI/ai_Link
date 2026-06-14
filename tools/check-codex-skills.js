#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const skillsRoot = path.join(root, "examples", "codex-skills");
const findings = [];

for (const entry of readdirSync(skillsRoot)) {
  const skillDir = path.join(skillsRoot, entry);
  if (!statSync(skillDir).isDirectory()) {
    continue;
  }

  const skillPath = path.join(skillDir, "SKILL.md");
  let text = "";
  try {
    text = readFileSync(skillPath, "utf8");
  } catch {
    findings.push(`${entry}: missing SKILL.md`);
    continue;
  }

  const frontmatter = readFrontmatter(text);
  if (!frontmatter) {
    findings.push(`${entry}: missing YAML frontmatter`);
    continue;
  }

  let metadata;
  try {
    metadata = parse(frontmatter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(`${entry}: invalid YAML frontmatter (${message})`);
    continue;
  }

  if (!metadata || typeof metadata !== "object") {
    findings.push(`${entry}: frontmatter must be a mapping`);
    continue;
  }

  if (metadata.name !== entry) {
    findings.push(`${entry}: frontmatter name must match folder name`);
  }

  if (typeof metadata.description !== "string" || metadata.description.trim().length < 40) {
    findings.push(`${entry}: description must be a meaningful trigger description`);
  }

  if (/\bTODO\b|\[TODO:/i.test(text)) {
    findings.push(`${entry}: remove template TODO text`);
  }
}

if (findings.length > 0) {
  console.error("Codex skill checks failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Codex skill checks passed.");

function readFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return null;
  }
  const normalized = text.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return null;
  }
  return normalized.slice(4, end);
}
