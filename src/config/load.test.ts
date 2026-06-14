import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./load.js";

test("loadConfig applies user, project, local, and session priority", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-link-config-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  mkdirSync(path.join(home, ".ai-link"), { recursive: true });
  mkdirSync(path.join(project, ".ai-link"), { recursive: true });

  writeFileSync(path.join(home, ".ai-link", "config.yaml"), "defaults:\n  provider: user\n");
  writeFileSync(path.join(project, ".ai-link", "project.yaml"), "defaults:\n  provider: project\n");
  writeFileSync(path.join(project, ".ai-link", "local.yaml"), "defaults:\n  provider: local\n");

  const loaded = loadConfig({
    cwd: project,
    homeDir: home,
    sessionConfig: {
      defaults: {
        provider: "session"
      }
    }
  });

  assert.equal(loaded.config.defaults?.provider, "session");
  assert.deepEqual(
    loaded.layers.map((layer) => layer.name),
    ["default", "user-global", "project-public", "project-local", "session"]
  );
});
