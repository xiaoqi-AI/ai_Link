#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const blockedPathParts = [
  `${path.sep}.env`,
  `${path.sep}runtime${path.sep}private${path.sep}`,
  `${path.sep}runtime${path.sep}downloads${path.sep}`,
  `${path.sep}runtime${path.sep}tmp${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}coverage${path.sep}`,
  `${path.sep}.git${path.sep}`
];

const sensitivePatterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "generic token assignment", pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'](?!replace-with|dev-|test-|example|mock)[A-Za-z0-9_\-./+=]{16,}["']/i },
  { name: "wechat cookie", pattern: /\b(?:wxuin|pass_ticket|wap_sid2|slave_sid)=/i }
];

const publicConfigPatterns = [
  /^\.ai-link\/project\.ya?ml$/,
  /^examples\/[^/]+\/project\.ya?ml$/
];

const privateProviderFields = new Set([
  "apiKey",
  "token",
  "secret",
  "password",
  "command",
  "args"
]);

const privateNestedFields = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "api-key",
  "access-token"
]);

const privatePathPatterns = [
  { name: "runtime private path", pattern: /(^|[\\/])runtime[\\/]private([\\/]|$)/i },
  { name: "env file path", pattern: /(^|[\\/])\.env(?:\.|[\\/]|$)/i },
  { name: "user profile path", pattern: /^[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]/i }
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPublicConfig(relative) {
  return publicConfigPatterns.some((pattern) => pattern.test(relative));
}

function joinYamlPath(parts) {
  return parts.join(".");
}

function walkYaml(value, visitor, parts = []) {
  visitor(value, parts);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkYaml(item, visitor, [...parts, String(index)]));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    walkYaml(child, visitor, [...parts, key]);
  }
}

function checkPublicConfig(relative, text, findings) {
  let parsed;
  try {
    parsed = parse(text);
  } catch (error) {
    findings.push({
      file: relative,
      type: "public config parse error",
      detail: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (!isRecord(parsed)) return;

  const providers = parsed.providers;
  if (isRecord(providers)) {
    for (const [providerName, provider] of Object.entries(providers)) {
      if (!isRecord(provider)) continue;
      for (const field of Object.keys(provider)) {
        if (privateProviderFields.has(field)) {
          findings.push({
            file: relative,
            type: "public config private provider field",
            detail: `providers.${providerName}.${field}`
          });
        }
      }
    }
  }

  walkYaml(parsed, (value, parts) => {
    if (parts.length === 0) return;
    const key = parts.at(-1);
    const loweredKey = key.toLowerCase();
    if (privateNestedFields.has(loweredKey)) {
      findings.push({
        file: relative,
        type: "public config private field",
        detail: joinYamlPath(parts)
      });
    }

    if (typeof value !== "string") return;
    for (const privatePath of privatePathPatterns) {
      if (privatePath.pattern.test(value)) {
        findings.push({
          file: relative,
          type: `public config ${privatePath.name}`,
          detail: joinYamlPath(parts)
        });
      }
    }
  });
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
  if (isPublicConfig(relative)) {
    checkPublicConfig(relative, text, findings);
  }
}

if (findings.length > 0) {
  console.error("Potential sensitive content found:");
  for (const finding of findings) {
    const detail = finding.detail ? ` (${finding.detail})` : "";
    console.error(`- ${finding.file}: ${finding.type}${detail}`);
  }
  process.exit(1);
}

console.log(`Security scan passed for ${files.length} files.`);
