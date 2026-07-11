import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { GoogleSearchConsoleConnector } from "../src/connectors/googleSearchConsole.js";
import {
  appendGscHistory,
  compareGscSnapshots,
  createGscSnapshot,
  latestGscSnapshot,
  loadGscHistory,
  resolveGscHistoryPath,
  saveGscHistory
} from "../src/connectors/gscHistory.js";

function monitorResult({
  checkedAt,
  siteUrl = "https://voice.example.com/",
  status = "ready_for_google",
  publicReady = true,
  issues = []
}) {
  return {
    checkedAt,
    siteUrl,
    summary: {
      conclusion: "public-safe conclusion",
      counts: { [status]: 1 }
    },
    urls: [{
      url: "https://voice.example.com/guide",
      status,
      publicReady,
      httpStatus: publicReady ? 200 : 500,
      robotsAllowed: true,
      sitemapIncluded: true,
      canonicalMatches: true,
      noindex: false,
      inspection: {
        coverageState: "third-party text must not be stored",
        lastCrawlTime: "2026-07-10T00:00:00Z",
        access_token: "must-not-be-stored"
      }
    }],
    globalIssues: issues
  };
}

describe("Google Search Console history", () => {
  it("creates a redacted baseline snapshot", () => {
    const snapshot = createGscSnapshot(monitorResult({ checkedAt: "2026-07-11T00:00:00Z" }));
    const changes = compareGscSnapshots(null, snapshot);

    assert.equal(changes.baseline, true);
    assert.equal(snapshot.urls[0].status, "ready_for_google");
    assert.equal("coverageState" in snapshot.urls[0], false);
    assert.equal(JSON.stringify(snapshot).includes("must-not-be-stored"), false);
    assert.equal(JSON.stringify(snapshot).includes("third-party text"), false);
  });

  it("classifies status recovery and issue changes between snapshots", () => {
    const previous = createGscSnapshot(monitorResult({
      checkedAt: "2026-07-10T00:00:00Z",
      status: "manual_action_required",
      publicReady: false,
      issues: [{ code: "page_fetch_failed", severity: "error", url: "https://voice.example.com/guide" }]
    }));
    const current = createGscSnapshot(monitorResult({
      checkedAt: "2026-07-11T00:00:00Z",
      status: "indexed",
      publicReady: true,
      issues: [{ code: "gsc_sitemap_warning", severity: "warning", url: "https://voice.example.com/sitemap.xml" }]
    }));
    const changes = compareGscSnapshots(previous, current);

    assert.equal(changes.baseline, false);
    assert.equal(changes.summary.total, 3);
    assert.equal(changes.summary.improved, 2);
    assert.equal(changes.summary.regressed, 1);
    assert.equal(changes.items.some((item) => item.type === "status_changed" && item.direction === "improved"), true);
    assert.equal(changes.items.some((item) => item.type === "issue_resolved"), true);
    assert.equal(changes.items.some((item) => item.type === "issue_added"), true);
  });

  it("retains only the configured number of snapshots and rejects cross-property reuse", () => {
    let history;
    for (let day = 1; day <= 3; day += 1) {
      history = appendGscHistory(history, createGscSnapshot(monitorResult({
        checkedAt: `2026-07-${String(day).padStart(2, "0")}T00:00:00Z`
      })), { limit: 2 });
    }
    assert.equal(history.entries.length, 2);
    assert.equal(latestGscSnapshot(history).checkedAt, "2026-07-03T00:00:00Z");

    assert.throws(
      () => appendGscHistory(history, createGscSnapshot(monitorResult({
        checkedAt: "2026-07-04T00:00:00Z",
        siteUrl: "sc-domain:other.example.com"
      }))),
      (error) => error.code === "gsc_history_site_mismatch"
    );
  });

  it("writes repository-local history only under runtime/private and strips unknown fields", async () => {
    assert.throws(
      () => resolveGscHistoryPath("runtime/tmp/history.json"),
      (error) => error.code === "gsc_history_path_unsafe"
    );
    const root = await mkdtemp(path.join(tmpdir(), "ai-link-gsc-history-"));
    try {
      const snapshot = createGscSnapshot(monitorResult({ checkedAt: "2026-07-11T00:00:00Z" }));
      snapshot.refresh_token = "must-not-survive";
      const history = appendGscHistory(undefined, snapshot);
      const file = await saveGscHistory("runtime/private/google-search-console/history.json", history, { cwd: root });
      const text = await readFile(file, "utf8");
      assert.equal(text.includes("must-not-survive"), false);
      const loaded = await loadGscHistory(file, { cwd: root });
      assert.equal(loaded.entries.length, 1);
      assert.equal(loaded.entries[0].refresh_token, undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("renders real snapshot differences in the Chinese report", () => {
    const connector = new GoogleSearchConsoleConnector();
    const report = connector.generateStatusReport({
      checkedAt: "2026-07-11T00:00:00Z",
      nextCheckAt: "2026-07-12T00:00:00Z",
      summary: { conclusion: "站点状态已恢复" },
      googleApi: { mode: "private-client" },
      urls: [{ url: "https://voice.example.com/guide", status: "indexed", publicReady: true }],
      alerts: [],
      changes: {
        baseline: false,
        previousCheckedAt: "2026-07-10T00:00:00Z",
        summary: { total: 1, improved: 1, regressed: 0 },
        items: [{
          type: "status_changed",
          direction: "improved",
          url: "https://voice.example.com/guide",
          fromStatus: "crawled_not_indexed",
          toStatus: "indexed"
        }]
      }
    });

    assert.match(report, /变化 1 项，改善 1 项，退化 0 项/);
    assert.match(report, /Google 已抓取但尚未索引 → 已索引（改善）/);
  });
});
