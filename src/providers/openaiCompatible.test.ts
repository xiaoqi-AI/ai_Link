import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { deepMerge } from "../config/load.js";
import { runAiLink } from "../router/index.js";
import type { AiLinkConfig } from "../types.js";

test("openai-compatible provider posts chat completions and extracts output", async () => {
  let receivedBody: Record<string, unknown> | undefined;
  let receivedAuth = "";
  const server = createServer((request, response) => {
    receivedAuth = request.headers.authorization ?? "";
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: "provider ok"
            }
          }
        ]
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  process.env.AI_LINK_TEST_KEY = "test-key";

  try {
    const config = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, {
      providers: {
        test: {
          type: "openai-compatible",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKeyEnv: "AI_LINK_TEST_KEY",
          model: "test-model"
        }
      },
      routes: {
        "test.chat": {
          provider: "test"
        }
      }
    }) as unknown as AiLinkConfig;

    const result = await runAiLink(config, {
      task: "test.chat",
      input: "hello",
      approvePolicy: true
    });

    assert.equal(result.output, "provider ok");
    assert.equal(receivedAuth, "Bearer test-key");
    assert.equal(receivedBody?.model, "test-model");
    assert.equal(Array.isArray(receivedBody?.messages), true);
  } finally {
    delete process.env.AI_LINK_TEST_KEY;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
