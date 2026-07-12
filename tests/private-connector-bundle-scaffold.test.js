import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describeConnectorRegistry } from "../src/connectors/contracts.js";
import { loadPrivateConnectorRegistry } from "../src/connectors/privateLoader.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const scaffoldScript = fileURLToPath(
  new URL("../tools/new-private-connector-bundle.js", import.meta.url)
);
const githubAdapterScript = fileURLToPath(
  new URL("../tools/new-github-auth-private-adapter.js", import.meta.url)
);
const wechatAdapterScript = fileURLToPath(
  new URL("../tools/new-wechat-official-health-private-adapter.js", import.meta.url)
);
const xhsAdapterScript = fileURLToPath(
  new URL("../tools/new-xiaohongshu-readonly-private-adapter.js", import.meta.url)
);

async function runScaffold({ cwd = process.cwd(), args = [], env = {} } = {}) {
  return runTool(scaffoldScript, { cwd, args, env });
}

async function runTool(script, { cwd = process.cwd(), args = [], env = {} } = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

async function writePrivateModule(workspace, name, source) {
  const modulePath = path.join(workspace, "runtime", "private", name);
  await mkdir(path.dirname(modulePath), { recursive: true });
  await writeFile(modulePath, source, "utf8");
  return modulePath;
}

async function importGeneratedModule(modulePath, label) {
  return import(`${pathToFileURL(modulePath).href}?case=${encodeURIComponent(label)}-${Date.now()}`);
}

async function captureError(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  assert.fail("Expected callback to reject.");
}

function assertDoesNotExposePath(value, workspace) {
  const text = String(value || "");
  assert.equal(text.includes(workspace), false);
  assert.equal(text.includes(workspace.replaceAll("\\", "/")), false);
}

describe("private connector bundle scaffold", () => {
  it("loads the three actual generated adapters through one private registry entry", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-private-bundle-integration-"));
    try {
      await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n', "utf8");
      const connectorDirectory = path.join(workspace, "src", "connectors");
      await mkdir(connectorDirectory, { recursive: true });
      await writeFile(
        path.join(connectorDirectory, "mockWechat.js"),
        await readFile(path.join(repositoryRoot, "src", "connectors", "mockWechat.js"), "utf8"),
        "utf8"
      );

      for (const script of [githubAdapterScript, wechatAdapterScript, xhsAdapterScript]) {
        const generated = await runTool(script, { cwd: workspace, args: ["--json"] });
        assert.equal(generated.status, 0, generated.stderr);
        assert.equal(JSON.parse(generated.stdout).summary.written, true, generated.stdout);
      }
      const bundled = await runScaffold({ cwd: workspace, args: ["--json"] });
      assert.equal(bundled.status, 0, bundled.stderr);
      assert.equal(JSON.parse(bundled.stdout).summary.written, true, bundled.stdout);

      const registry = await loadPrivateConnectorRegistry({
        modulePath: path.join(workspace, "runtime", "private", "platform-connectors.mjs"),
        workspaceRoot: workspace
      });
      const summary = describeConnectorRegistry(registry);
      for (const platform of ["github", "wechat_official", "xiaohongshu"]) {
        const connector = summary.connectors.find((item) => item.platform === platform);
        assert.equal(connector.status, "available", platform);
        assert.equal(connector.mode, "private", platform);
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("combines the three default private modules into one generated factory", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-private-bundle-"));
    try {
      await writePrivateModule(workspace, "github-auth-adapter.mjs", `
export async function createPrivateConnectors() {
  return { github: { mode: "private", fixture: "github" } };
}
`);
      await writePrivateModule(workspace, "wechat-official-health-adapter.mjs", `
export async function createPrivateConnectors() {
  return { wechat_official: { mode: "private", fixture: "wechat" } };
}
`);
      await writePrivateModule(workspace, "xiaohongshu-readonly-adapter.mjs", `
export async function createPrivateConnectors() {
  return { xiaohongshu: { mode: "private", fixture: "xiaohongshu" } };
}
`);

      const result = await runScaffold({ cwd: workspace, args: ["--json"] });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);
      assert.equal(report.summary.output, "runtime/private/platform-connectors.mjs");
      assert.equal(report.summary.moduleCount, 3);
      assert.deepEqual(report.modules, [
        "runtime/private/github-auth-adapter.mjs",
        "runtime/private/wechat-official-health-adapter.mjs",
        "runtime/private/xiaohongshu-readonly-adapter.mjs"
      ]);

      const bundlePath = path.join(workspace, "runtime", "private", "platform-connectors.mjs");
      const bundleText = await readFile(bundlePath, "utf8");
      assertDoesNotExposePath(bundleText, workspace);
      assert.match(bundleText, /\?mtime=\d+/);

      const bundle = await importGeneratedModule(bundlePath, "defaults");
      const connectors = await bundle.createPrivateConnectors();
      assert.deepEqual(Object.keys(connectors).sort(), ["github", "wechat_official", "xiaohongshu"]);
      assert.equal(connectors.github.fixture, "github");
      assert.equal(connectors.wechat_official.fixture, "wechat");
      assert.equal(connectors.xiaohongshu.fixture, "xiaohongshu");

      const nestedOutput = "runtime/private/bundles/platform-connectors.mjs";
      const nestedResult = await runScaffold({
        cwd: workspace,
        args: ["--json", "--output", nestedOutput]
      });
      assert.equal(JSON.parse(nestedResult.stdout).summary.written, true, nestedResult.stdout);
      const nestedBundle = await importGeneratedModule(
        path.join(workspace, ...nestedOutput.split("/")),
        "nested-output"
      );
      assert.deepEqual(
        Object.keys(await nestedBundle.createPrivateConnectors()).sort(),
        ["github", "wechat_official", "xiaohongshu"]
      );

      const withoutForce = await runScaffold({ cwd: workspace, args: ["--json"] });
      assert.equal(JSON.parse(withoutForce.stdout).summary.ok, false);
      const withForce = await runScaffold({ cwd: workspace, args: ["--json", "--force"] });
      assert.equal(JSON.parse(withForce.stdout).summary.written, true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects duplicate platforms at runtime when --module is repeated", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-private-bundle-"));
    try {
      await writePrivateModule(workspace, "first.mjs", `
export function createPrivateConnectors() {
  return { github: { mode: "private", source: "first" } };
}
`);
      await writePrivateModule(workspace, "second.mjs", `
export function createPrivateConnectors() {
  return { github: { mode: "private", source: "second" } };
}
`);

      const result = await runScaffold({
        cwd: workspace,
        args: ["--json", "--module", "first.mjs", "--module", "second.mjs"]
      });
      const report = JSON.parse(result.stdout);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.written, true);

      const bundlePath = path.join(workspace, "runtime", "private", "platform-connectors.mjs");
      const bundle = await importGeneratedModule(bundlePath, "duplicate-platform");
      const error = await captureError(() => bundle.createPrivateConnectors());
      assert.equal(error.code, "connector_contract_failed");
      assert.equal(error.reason, "duplicate_private_connector_platform");
      assertDoesNotExposePath(error.message, workspace);
      assertDoesNotExposePath(error.stack, workspace);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects modules without a factory or an object connector map at runtime", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-private-bundle-"));
    try {
      const cases = [
        {
          name: "missing-factory.mjs",
          output: "runtime/private/missing-factory-bundle.mjs",
          source: "export const connector = {};\n",
          reason: "private_connector_factory_missing"
        },
        {
          name: "invalid-export.mjs",
          output: "runtime/private/invalid-export-bundle.mjs",
          source: "export function createPrivateConnectors() { return []; }\n",
          reason: "invalid_private_connector_export"
        }
      ];

      for (const testCase of cases) {
        await writePrivateModule(workspace, testCase.name, testCase.source);
        const result = await runScaffold({
          cwd: workspace,
          args: [
            "--json",
            "--module",
            testCase.name,
            "--output",
            testCase.output
          ]
        });
        const report = JSON.parse(result.stdout);
        assert.equal(report.summary.ok, true, result.stdout);
        assert.equal(report.summary.written, true);

        const bundle = await importGeneratedModule(
          path.join(workspace, ...testCase.output.split("/")),
          testCase.name
        );
        const error = await captureError(() => bundle.createPrivateConnectors());
        assert.equal(error.reason, testCase.reason);
        assertDoesNotExposePath(error.stack, workspace);
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects outside, missing, duplicate, self-output, and unsupported module paths", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-private-bundle-"));
    try {
      const validModule = await writePrivateModule(workspace, "valid.mjs", `
export function createPrivateConnectors() { return { github: {} }; }
`);
      const outsideModule = path.join(workspace, "outside.mjs");
      await writeFile(outsideModule, "export function createPrivateConnectors() { return {}; }\n", "utf8");
      await writePrivateModule(workspace, "unsupported.txt", "not a module\n");
      const selfModule = await writePrivateModule(workspace, "self.mjs", `
export function createPrivateConnectors() { return { github: {} }; }
`);

      const cases = [
        {
          args: ["--json", "--module", outsideModule],
          blocker: "Module paths must stay under runtime/private."
        },
        {
          args: ["--json", "--module", "missing.mjs"],
          blocker: "Module file does not exist."
        },
        {
          args: [
            "--json",
            "--module",
            validModule,
            "--output",
            path.join(workspace, "outside-bundle.mjs")
          ],
          blocker: "Output path must stay under runtime/private."
        },
        {
          args: ["--json", "--module", "valid.mjs", "--module", "valid.mjs"],
          blocker: "Duplicate module paths are not allowed."
        },
        {
          args: [
            "--json",
            "--force",
            "--module",
            selfModule,
            "--output",
            "runtime/private/self.mjs"
          ],
          blocker: "Output file must not also be an input module."
        },
        {
          args: ["--json", "--module", "unsupported.txt"],
          blocker: "Module file extension must be .mjs or .js."
        }
      ];

      for (const testCase of cases) {
        const result = await runScaffold({ cwd: workspace, args: testCase.args });
        const report = JSON.parse(result.stdout);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(report.summary.ok, false, result.stdout);
        assert.ok(report.blockers.includes(testCase.blocker), result.stdout);
        assertDoesNotExposePath(result.stdout, workspace);
        assertDoesNotExposePath(result.stderr, workspace);
      }

      assert.match(await readFile(selfModule, "utf8"), /createPrivateConnectors/);
      await assert.rejects(
        readFile(path.join(workspace, "runtime", "private", "platform-connectors.mjs"), "utf8")
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("prints a safe handoff without writing a bundle", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ai-link-private-bundle-"));
    const markerValue = "fixture-value-that-must-not-print";
    try {
      await writePrivateModule(workspace, "single.mjs", `
export function createPrivateConnectors() { return { github: {} }; }
`);
      const result = await runScaffold({
        cwd: workspace,
        args: [
          "--print",
          "--module",
          "single.mjs",
          "--output",
          "runtime/private/preview-bundle.mjs"
        ],
        env: { AI_LINK_BUNDLE_TEST_VALUE: markerValue }
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Private Connector Bundle Scaffold/);
      assert.match(result.stdout, /runtime\/private\/preview-bundle\.mjs/);
      assert.equal(result.stdout.includes(markerValue), false);
      assert.equal(result.stderr.includes(markerValue), false);
      await assert.rejects(
        readFile(path.join(workspace, "runtime", "private", "preview-bundle.mjs"), "utf8")
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
