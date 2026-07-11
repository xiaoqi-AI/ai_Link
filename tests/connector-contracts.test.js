import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeConnectorRegistry, validateConnectorRegistry } from "../src/connectors/contracts.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import {
  classifyUrlStatus,
  GoogleSearchConsoleConnector,
  MockGoogleSearchConsoleApiClient
} from "../src/connectors/googleSearchConsole.js";

function response(body, { status = 200, headers = {}, url } = {}) {
  const value = new Response(body, { status, headers });
  Object.defineProperty(value, "url", { value: url || "" });
  return value;
}

describe("connector contracts", () => {
  it("describes public mock and reserved connectors without exposing implementation details", () => {
    const summary = describeConnectorRegistry(createConnectorRegistry());
    const wechat = summary.connectors.find((connector) => connector.platform === "wechat_official");
    const gsc = summary.connectors.find((connector) => connector.platform === "google_search_console");
    const douyin = summary.connectors.find((connector) => connector.platform === "douyin");

    assert.equal(summary.issues.length, 0);
    assert.equal(wechat.status, "available");
    assert.equal(wechat.capabilities.find((capability) => capability.name === "check_health").available, true);
    assert.equal(wechat.capabilities.find((capability) => capability.name === "publish").available, true);
    assert.equal(gsc.status, "available");
    assert.equal(gsc.mode, "public-check+mock-google-api");
    assert.equal(gsc.capabilities.find((capability) => capability.name === "inspect_url").mode, "mock");
    assert.equal(gsc.capabilities.find((capability) => capability.name === "check_public_crawlability").mode, "live-read-only");
    assert.equal(douyin.status, "reserved");
    assert.equal(douyin.capabilities.find((capability) => capability.name === "publish").available, false);
    assert.equal(typeof wechat.readContent, "undefined");
  });

  it("reports misconfigured connectors before a real platform adapter is enabled", () => {
    const issues = validateConnectorRegistry({
      wechat_official: { status: "reserved" },
      zhuque_ai: { detectText: async () => ({}) },
      douyin: { readContent: async () => ({}) },
      xiaohongshu: { status: "reserved" },
      zhihu: { status: "reserved" },
      toutiao: { status: "reserved" }
    });

    assert.equal(
      issues.some((issue) =>
        issue.platform === "douyin"
        && issue.code === "connector_contract_failed"
        && issue.reason === "capability_missing"
      ),
      true
    );
  });

  it("checks public crawlability and classifies Google lag without treating it as a site failure", async () => {
    const siteUrl = "https://voice.example.com/";
    const articleUrl = "https://voice.example.com/guide";
    const legacyUrl = "https://voice.example.com/guide.html";
    const sitemapUrl = "https://voice.example.com/sitemap.xml";
    const fixtures = new Map([
      [
        "https://voice.example.com/robots.txt",
        response(`User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`, { url: "https://voice.example.com/robots.txt" })
      ],
      [
        sitemapUrl,
        response(`<?xml version="1.0"?><urlset><url><loc>${articleUrl}</loc></url></urlset>`, { url: sitemapUrl })
      ],
      [
        articleUrl,
        response(`<html><head><link href="${articleUrl}" rel="canonical"><meta content="index,follow" name="robots"></head></html>`, { url: articleUrl })
      ],
      [
        legacyUrl,
        response(null, { status: 308, headers: { location: articleUrl }, url: legacyUrl })
      ]
    ]);
    const apiClient = new MockGoogleSearchConsoleApiClient({
      sites: [
        { siteUrl, permissionLevel: "siteOwner" },
        { siteUrl: "https://unrelated.example.com/", permissionLevel: "siteOwner" }
      ],
      inspections: {
        [articleUrl]: {
          indexStatusResult: {
            verdict: "NEUTRAL",
            coverageState: "Discovered - currently not indexed",
            robotsTxtState: "ALLOWED",
            indexingState: "INDEXING_ALLOWED",
            userCanonical: articleUrl
          }
        }
      },
      sitemaps: [{ siteUrl, path: sitemapUrl, errors: 0, warnings: 0 }]
    });
    const connector = new GoogleSearchConsoleConnector({
      apiClient,
      fetchImpl: async (url) => {
        const value = fixtures.get(url);
        if (!value) throw new Error(`Missing fixture: ${url}`);
        return value;
      },
      resolveHost: async () => [{ address: "93.184.216.34" }],
      clock: () => new Date("2026-07-11T00:00:00.000Z")
    });

    const result = await connector.monitorSite({
      siteUrl,
      urls: [articleUrl],
      sitemaps: [sitemapUrl],
      legacyUrls: { [legacyUrl]: articleUrl },
      schedule: "daily"
    });

    assert.equal(result.urls[0].publicReady, true);
    assert.equal(result.urls[0].status, "discovered_not_indexed");
    assert.equal(result.urls[0].legacyRedirects[0].ok, true);
    assert.equal(result.summary.requiresManualAction, false);
    assert.deepEqual(result.googleApi.sites, [{ siteUrl, permissionLevel: "siteOwner" }]);
    assert.match(result.reportMarkdown, /站点技术抓取条件正常/);
    assert.match(result.reportMarkdown, /Google 已发现但尚未索引/);
    assert.equal(JSON.stringify(result).includes("<html>"), false);
  });

  it("keeps sitemap submission behind an explicit approval gate", async () => {
    const connector = new GoogleSearchConsoleConnector({
      resolveHost: async () => [{ address: "93.184.216.34" }]
    });
    const preview = await connector.submitSitemap({
      siteUrl: "https://voice.example.com/",
      feedpath: "https://voice.example.com/sitemap.xml"
    });

    assert.equal(preview.status, "manual_action_required");
    assert.equal(preview.approval.required, true);
  });

  it("can expand monitored URLs from same-origin sitemaps for full-range readonly checks", async () => {
    const siteUrl = "sc-domain:example.com";
    const publicBaseUrl = "https://voice.example.com/";
    const homeUrl = "https://voice.example.com/";
    const articleUrl = "https://voice.example.com/guide";
    const sitemapUrl = "https://voice.example.com/sitemap.xml";
    const fixtures = new Map([
      [
        "https://voice.example.com/robots.txt",
        response(`User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`, { url: "https://voice.example.com/robots.txt" })
      ],
      [
        sitemapUrl,
        response(`<?xml version="1.0"?><urlset><url><loc>${homeUrl}</loc></url><url><loc>${articleUrl}</loc></url></urlset>`, { url: sitemapUrl })
      ],
      [
        homeUrl,
        response(`<html><head><link href="${homeUrl}" rel="canonical"></head></html>`, { url: homeUrl })
      ],
      [
        articleUrl,
        response(`<html><head><link href="${articleUrl}" rel="canonical"></head></html>`, { url: articleUrl })
      ]
    ]);
    const apiClient = new MockGoogleSearchConsoleApiClient({
      sites: [{ siteUrl, permissionLevel: "siteOwner" }],
      inspections: {
        [homeUrl]: {
          indexStatusResult: {
            verdict: "PASS",
            coverageState: "Submitted and indexed",
            robotsTxtState: "ALLOWED",
            indexingState: "INDEXING_ALLOWED",
            userCanonical: homeUrl
          }
        },
        [articleUrl]: {
          indexStatusResult: {
            verdict: "NEUTRAL",
            coverageState: "URL is unknown to Google",
            robotsTxtState: "ALLOWED",
            indexingState: "INDEXING_ALLOWED",
            userCanonical: articleUrl
          }
        }
      },
      sitemaps: [{ siteUrl, path: sitemapUrl, errors: 0, warnings: 0 }]
    });
    const connector = new GoogleSearchConsoleConnector({
      apiClient,
      fetchImpl: async (url) => {
        const value = fixtures.get(url);
        if (!value) throw new Error(`Missing fixture: ${url}`);
        return value;
      },
      resolveHost: async () => [{ address: "93.184.216.34" }]
    });

    const result = await connector.monitorSite({
      siteUrl,
      publicBaseUrl,
      urls: [homeUrl],
      includeSitemapUrls: true,
      sitemaps: [sitemapUrl]
    });

    assert.deepEqual(result.urls.map((item) => item.url).sort(), [homeUrl, articleUrl].sort());
    assert.equal(result.summary.totalUrls, 2);
    assert.equal(result.urls.find((item) => item.url === articleUrl).status, "ready_for_google");
  });

  it("lets current technical faults override an earlier manual indexing request", () => {
    const status = classifyUrlStatus({
      publicCheck: {
        robotsAllowed: true,
        sitemapIncluded: true,
        publicReady: true,
        issues: []
      },
      inspection: {
        coverageState: "URL is unknown to Google",
        robotsTxtState: "DISALLOWED",
        pageFetchState: "BLOCKED_ROBOTS_TXT"
      },
      operatorState: "indexing_requested_by_user"
    });

    assert.equal(status, "blocked_by_robots");
  });

  it("refuses a public-check redirect before contacting a private address", async () => {
    const calls = [];
    const connector = new GoogleSearchConsoleConnector({
      fetchImpl: async (url) => {
        calls.push(url);
        return response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/robots.txt" },
          url
        });
      },
      resolveHost: async () => [{ address: "93.184.216.34" }]
    });
    const result = await connector.checkPublicCrawlability({
      siteUrl: "https://voice.example.com/",
      urls: ["https://voice.example.com/guide"],
      sitemaps: ["https://voice.example.com/sitemap.xml"]
    });

    assert.equal(result.robots.issues[0].code, "robots_fetch_failed");
    assert.equal(calls.some((url) => url.includes("127.0.0.1")), false);
  });

  it("rejects tracked URLs that could leak credentials through reports", async () => {
    const connector = new GoogleSearchConsoleConnector({
      resolveHost: async () => [{ address: "93.184.216.34" }]
    });

    await assert.rejects(
      connector.checkPublicCrawlability({
        siteUrl: "https://voice.example.com/",
        urls: ["https://voice.example.com/guide?access_token=do-not-log"],
        sitemaps: ["https://voice.example.com/sitemap.xml"]
      }),
      (error) => error.code === "invalid_gsc_input" && !error.message.includes("do-not-log")
    );
  });
});
