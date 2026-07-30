#!/usr/bin/env node
import path from "node:path";
import { stdin as input, stderr as output } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  authorizeGoogleDesktop,
  loadGoogleDesktopClientConfig,
  saveAuthorizedUserCredentials
} from "./googleOAuthDesktop.js";

const DEFAULT_OUTPUT = "runtime/private/google-search-console/authorized-user.json";

function parseArgs(argv) {
  const result = {
    clientConfig: "",
    output: DEFAULT_OUTPUT,
    force: false,
    manualCallbackUrl: false,
    showAuthUrl: false,
    timeoutMs: 5 * 60_000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--client-config") result.clientConfig = argv[++index] || "";
    else if (value === "--output") result.output = argv[++index] || "";
    else if (value === "--timeout-ms") result.timeoutMs = Number(argv[++index] || 0);
    else if (value === "--force") result.force = true;
    else if (value === "--manual-callback-url") result.manualCallbackUrl = true;
    else if (value === "--show-auth-url") result.showAuthUrl = true;
    else if (["--help", "-h"].includes(value)) result.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function printHelp() {
  console.log(`AI Link Google Search Console read-only authorization

Usage:
  ai-link-gsc-auth --client-config <desktop-client.json>
    [--output runtime/private/google-search-console/authorized-user.json]
    [--timeout-ms 300000]
    [--show-auth-url]
    [--manual-callback-url]
    [--force]

Safety:
  - Requests only the webmasters.readonly scope.
  - Uses the system browser, PKCE, state validation, and a 127.0.0.1 loopback callback.
  - Never prints tokens or authorization codes.
  - --show-auth-url prints a same-machine, time-limited Google authorization URL for manual opening.
  - --manual-callback-url prompts for the final 127.0.0.1 callback URL in this local terminal if the browser cannot reach the local callback automatically.
  - Credential files inside this repository must stay under runtime/private/.
  - --force replaces an existing local credential and should be used only intentionally.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.clientConfig) {
    printHelp();
    throw new Error("--client-config is required.");
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 30_000 || args.timeoutMs > 15 * 60_000) {
    throw new Error("--timeout-ms must be between 30000 and 900000.");
  }

  const clientConfig = await loadGoogleDesktopClientConfig(args.clientConfig);
  console.log("Opening the system browser for Google Search Console read-only authorization...");
  console.log("No token, authorization code, or Google response body will be printed.");
  const credentials = await authorizeGoogleDesktop({
    clientConfig,
    timeoutMs: args.timeoutMs,
    onAuthorizationUrl: (args.showAuthUrl || args.manualCallbackUrl) ? (url) => {
      console.log("Manual authorization URL for this same computer:");
      console.log(url);
      console.log("Open this URL in the local browser before the command times out. Do not paste it into chat, Git, issues, PRs, or the knowledge base.");
    } : undefined,
    manualCallbackUrlProvider: args.manualCallbackUrl ? ({ signal }) => readManualCallbackUrl({ signal }) : undefined
  });
  const output = await saveAuthorizedUserCredentials(args.output, credentials, { force: args.force });
  console.log("Google Search Console read-only authorization completed.");
  console.log(`Credential saved to: ${path.relative(process.cwd(), output) || output}`);
  console.log("Next: run ai-link-gsc with --credentials and your public monitor configuration.");
}

main().catch((error) => {
  const code = error?.code ? ` (${error.code})` : "";
  console.error(`gsc-authorize: ${error?.message || "Authorization failed."}${code}`);
  if (error?.code === "gsc_oauth_timeout") {
    console.error([
      "",
      "Troubleshooting:",
      "  - Check the Google authorization tab opened in your system browser.",
      "  - If no tab opened, rerun with --show-auth-url and manually open the printed URL on this same computer.",
      "  - If the browser cannot reach 127.0.0.1 after Google approval, rerun with --manual-callback-url and paste the final 127.0.0.1 callback URL into the local terminal.",
      "  - If Google shows redirect_uri_mismatch, use a Desktop app OAuth client JSON, not a Web application client JSON.",
      "  - If the OAuth app is in Testing, make sure the signed-in Google account is listed as a test user.",
      "  - If state mismatch appears, close old Google OAuth tabs and rerun the command once.",
      "  - On success, the browser says \"Read-only authorization received\" and the authorized-user file is updated."
    ].join("\n"));
  }
  process.exitCode = 1;
});

async function readManualCallbackUrl({ signal }) {
  const reader = createInterface({ input, output });
  try {
    output.write([
      "",
      "If the browser cannot reach the local callback after Google approval, paste the final 127.0.0.1 callback URL here.",
      "This input stays in the local terminal. Do not paste the URL into chat, Git, issues, PRs, or the knowledge base.",
      ""
    ].join("\n"));
    return await reader.question("Local callback URL: ", { signal });
  } finally {
    reader.close();
  }
}
