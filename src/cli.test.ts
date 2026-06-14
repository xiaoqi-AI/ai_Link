import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cliPath = path.resolve("dist", "cli.js");

test("skill draft --write previews without --yes", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-preview-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      ".ai-link/local.yaml"
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Preview only/);
    assert.equal(existsSync(path.join(tempRoot, ".ai-link", "local.yaml")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft --write --yes merges into local config", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-write-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok, article draft with Kimi",
      "--write",
      ".ai-link/local.yaml",
      "--yes"
    ]);

    const targetPath = path.join(tempRoot, ".ai-link", "local.yaml");
    assert.equal(result.status, 0);
    assert.equal(existsSync(targetPath), true);
    const written = readFileSync(targetPath, "utf8");
    assert.match(written, /auto_ops\.research/);
    assert.match(written, /auto_ops\.article_draft/);
    assert.match(written, /workflows:/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft refuses public project config writes without explicit override", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-public-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      ".ai-link/project.yaml",
      "--yes"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to write/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill draft refuses writes outside ai-link config files", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-skill-outside-"));
  try {
    const result = runCli(tempRoot, [
      "skill",
      "draft",
      "--skill",
      "auto_ops",
      "--description",
      "research with Grok",
      "--write",
      "notes.yaml",
      "--yes"
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside \.ai-link/);
    assert.equal(existsSync(path.join(tempRoot, "notes.yaml")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function runCli(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
