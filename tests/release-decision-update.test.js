import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const updateScript = fileURLToPath(new URL("../tools/update-release-decision.js", import.meta.url));
const checkScript = fileURLToPath(new URL("../tools/check-release-decisions.js", import.meta.url));
const decisionPath = path.join("docs", "releases", "v0.1.0-decisions.json");

async function runScript(script, cwd, args = ["--json"]) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const status = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  return {
    status,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

async function withFixture(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-link-release-decision-update-"));
  try {
    await mkdir(path.join(dir, "docs", "releases"), { recursive: true });
    await writeFile(path.join(dir, decisionPath), JSON.stringify(baseRecord(), null, 2), "utf8");
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readRecord(dir) {
  return JSON.parse(await readFile(path.join(dir, decisionPath), "utf8"));
}

describe("release decision updater", () => {
  it("previews changes without writing unless --yes is present", async () => {
    await withFixture(async (dir) => {
      const before = await readFile(path.join(dir, decisionPath), "utf8");
      const result = await runScript(updateScript, dir, [
        "--json",
        "--id",
        "npm-publish-decision",
        "--status",
        "approved",
        "--selected-channel",
        "repository-local",
        "--evidence",
        "Release owner selected repository-local after package smoke checks."
      ]);
      const report = JSON.parse(result.stdout);
      const after = await readFile(path.join(dir, decisionPath), "utf8");

      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.summary.ok, true);
      assert.equal(report.summary.previewOnly, true);
      assert.equal(report.summary.updated, false);
      assert.equal(report.changes.some((change) => change.field === "status"), true);
      assert.equal(report.changes.some((change) => change.field === "selectedChannel"), true);
      assert.equal(after, before);
    });
  });

  it("writes approved decisions and lets strict release-decision checks pass", async () => {
    await withFixture(async (dir) => {
      const updates = [
        ["github-branch-protection", "Repository maintainer confirmed main ruleset requires Verify."],
        ["github-secret-scanning", "Repository maintainer confirmed secret scanning and push protection are enabled."],
        ["npm-publish-decision", "Release owner selected repository-local after package smoke checks."],
        ["provider-live-credentials", "Secret owner confirmed provider-live remains skipped until cost approval."]
      ];

      for (const [id, evidence] of updates) {
        const args = [
          "--json",
          "--id",
          id,
          "--status",
          "approved"
        ];
        if (id === "npm-publish-decision") {
          args.push("--selected-channel", "repository-local");
        }
        args.push(
          "--evidence",
          evidence,
          "--yes"
        );
        const result = await runScript(updateScript, dir, args);
        assert.equal(result.status, 0, result.stderr || result.stdout);
      }

      const record = await readRecord(dir);
      assert.equal(record.decisions.every((decision) => decision.status === "approved"), true);
      assert.equal(record.decisions.find((decision) => decision.id === "npm-publish-decision").selectedChannel, "repository-local");

      const strictResult = await runScript(checkScript, dir, ["--json", "--strict"]);
      const strictReport = JSON.parse(strictResult.stdout);

      assert.equal(strictResult.status, 0, strictResult.stderr);
      assert.equal(strictReport.summary.strictOk, true);
      assert.equal(strictReport.summary.manualOpen, 0);
    });
  });

  it("rejects approval without evidence", async () => {
    await withFixture(async (dir) => {
      const result = await runScript(updateScript, dir, [
        "--json",
        "--id",
        "github-branch-protection",
        "--status",
        "approved"
      ]);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.match(report.summary.error, /evidence/i);
    });
  });

  it("rejects secret-like evidence without echoing it", async () => {
    await withFixture(async (dir) => {
      const secretLike = "sk-testvalue12345678901234567890";
      const result = await runScript(updateScript, dir, [
        "--json",
        "--id",
        "github-secret-scanning",
        "--status",
        "approved",
        "--evidence",
        secretLike
      ]);
      const combined = `${result.stdout}\n${result.stderr}`;
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.match(report.summary.error, /secret-like/i);
      assert.equal(combined.includes(secretLike), false);
    });
  });

  it("only allows release channel updates on the npm publish decision", async () => {
    await withFixture(async (dir) => {
      const result = await runScript(updateScript, dir, [
        "--json",
        "--id",
        "github-secret-scanning",
        "--selected-channel",
        "npm-public"
      ]);
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.summary.ok, false);
      assert.match(report.summary.error, /npm-publish-decision/);
    });
  });
});

function baseRecord() {
  return {
    schemaVersion: 1,
    release: "v0.1.0",
    updatedAt: "2026-06-15",
    safety: [
      "This public decision record contains only gate status, owner roles, non-sensitive evidence references, and release intent.",
      "Do not add API keys, tokens, Bitwarden values, .env contents, provider responses, screenshots, QR codes, login state, or runtime/private paths.",
      "Use approved only after the release owner or relevant maintainer has reviewed the external setting or evidence."
    ],
    decisions: [
      decision("github-branch-protection", "GitHub branch protection", "Repository maintainer"),
      decision("github-secret-scanning", "GitHub secret scanning and push protection", "Repository maintainer"),
      {
        ...decision("npm-publish-decision", "v0.1 release channel and npm publish decision", "Release owner"),
        selectedChannel: "undecided",
        allowedChannels: ["undecided", "repository-local", "github-release", "npm-public"]
      },
      decision("provider-live-credentials", "Provider-live credentials and cost approval", "Secret owner and cost approver")
    ]
  };
}

function decision(id, title, owner) {
  return {
    id,
    title,
    status: "pending",
    owner,
    decision: `${title} decision.`,
    requiredFor: ["v0.1"],
    evidence: [],
    notes: "Record only public-safe evidence."
  };
}
