import express from "express";
import { loadConfig } from "./config.js";
import { createStore } from "./storage/index.js";
import { seedConfiguredTokens } from "./security/auth.js";
import { createApiRouter } from "./routes/api.js";
import { createUiRouter } from "./routes/ui.js";
import { NotificationService } from "./notifications/email.js";
import { requireCloudflareAccess } from "./security/cloudflareAccess.js";
import { LoginRateLimiter } from "./security/loginRateLimit.js";
import { browserSecurityHeaders } from "./security/browserHeaders.js";
import { createConnectorRegistry } from "./connectors/registry.js";

export async function createApp(options = {}) {
  const config = options.config || loadConfig(options.env || process.env);
  const store = options.store || createStore(config);
  await store.init();
  await seedConfiguredTokens(store, config.apiTokens);

  const notifier = options.notifier || new NotificationService({ config, store });
  const connectorRegistry = options.connectorRegistry || createConnectorRegistry();
  const loginRateLimiter = options.loginRateLimiter || new LoginRateLimiter({
    ...config.loginRateLimit,
    clock: options.clock || (() => Date.now())
  });
  const app = express();
  app.disable("x-powered-by");
  app.locals.config = config;
  app.locals.store = store;
  app.locals.notifier = notifier;
  app.locals.connectorRegistry = connectorRegistry;
  app.locals.loginRateLimiter = loginRateLimiter;
  app.locals.clock = options.clock || (() => Date.now());

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(browserSecurityHeaders);

  app.get("/healthz", (req, res) => {
    res.json({ ok: true, service: "ai-link-auth-hub" });
  });

  app.use(requireCloudflareAccess(config));
  app.use("/api", createApiRouter());
  app.use(createUiRouter());

  app.use((err, req, res, next) => {
    void next;
    console.error(err);
    if (req.path.startsWith("/api")) {
      res.status(500).json({ error: "internal_error" });
      return;
    }
    res.status(500).send("Internal error");
  });

  return { app, store, config };
}
