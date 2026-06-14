import { createApp } from "./app.js";

const { app, config, store } = await createApp();

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`AI Link authorization hub listening on ${config.port}`);
  if (!config.isProduction) {
    console.log("Development defaults are enabled. Set AI_LINK_* secrets before exposing this service.");
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down.`);
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
