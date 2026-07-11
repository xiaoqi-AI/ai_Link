#!/usr/bin/env node
import path from "node:path";
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
    timeoutMs: 5 * 60_000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--client-config") result.clientConfig = argv[++index] || "";
    else if (value === "--output") result.output = argv[++index] || "";
    else if (value === "--timeout-ms") result.timeoutMs = Number(argv[++index] || 0);
    else if (value === "--force") result.force = true;
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
    [--force]

Safety:
  - Requests only the webmasters.readonly scope.
  - Uses the system browser, PKCE, state validation, and a 127.0.0.1 loopback callback.
  - Never prints tokens or authorization codes.
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
  const credentials = await authorizeGoogleDesktop({ clientConfig, timeoutMs: args.timeoutMs });
  const output = await saveAuthorizedUserCredentials(args.output, credentials, { force: args.force });
  console.log("Google Search Console read-only authorization completed.");
  console.log(`Credential saved to: ${path.relative(process.cwd(), output) || output}`);
  console.log("Next: run ai-link-gsc with --credentials and your public monitor configuration.");
}

main().catch((error) => {
  const code = error?.code ? ` (${error.code})` : "";
  console.error(`gsc-authorize: ${error?.message || "Authorization failed."}${code}`);
  process.exitCode = 1;
});
