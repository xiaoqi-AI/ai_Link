#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const blockedPathParts = [
  `${path.sep}.env`,
  `${path.sep}runtime${path.sep}private${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}coverage${path.sep}`,
  `${path.sep}.git${path.sep}`
];

const sensitivePatterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "generic token assignment", pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'](?!replace-with|dev-|test-|example|mock)[A-Za-z0-9_\-./+=]{16,}["']/i },
  { name: "wechat cookie", pattern: /\b(?:wxuin|pass_ticket|wap_sid2|slave_sid)=/i }
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (blockedPathParts.some((part) => fullPath.includes(part))) continue;
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const files = await walk(root);
const findings = [];

for (const file of files) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (relative === "package-lock.json") continue;
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    continue;
  }
  for (const check of sensitivePatterns) {
    if (check.pattern.test(text)) {
      findings.push({ file: relative, type: check.name });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential sensitive content found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.type}`);
  }
  process.exit(1);
}

console.log(`Security scan passed for ${files.length} files.`);
