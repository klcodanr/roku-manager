import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHono } from "@hono/zod-openapi";
import { pinoLogger } from "hono-pino";
import { problemDetailsHandler } from "hono-problem-details";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Enforcer } from "./lib/enforcer";
import type { EventLog } from "./lib/event-log";
import type { RokuService } from "./lib/roku";
import { Store } from "./lib/store";
import rootLogger from "./logger";
import { registerDeviceRoutes } from "./routes/devices";
import { registerEnforcerRoutes } from "./routes/enforcer";
import { registerSettingsRoutes } from "./routes/settings";

const logger = rootLogger.child({ module: "server" });

export const startServer = ({
  roku,
  store,
  enforcer,
  eventLog,
}: {
  roku: RokuService;
  store: Store;
  enforcer: Enforcer;
  eventLog: EventLog;
}) => {
  const app = new OpenAPIHono();
  const username = process.env.AUTH_USER || "admin";
  const password = process.env.AUTH_PASSWORD || "change-me";

  if (!process.env.AUTH_PASSWORD) {
    logger.warn("AUTH_PASSWORD is not set; using the development password change-me");
  }

  app.use(
    pinoLogger({
      pino: rootLogger,
    }),
  );

  const problemHandler = problemDetailsHandler();
  app.onError((error, c) => {
    logger.error(
      {
        err: error,
        method: c.req.method,
        path: c.req.path,
      },
      "Unhandled request error",
    );
    return problemHandler(error, c);
  });

  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    const header = c.req.header("authorization") || "";
    const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    if (header !== expected) {
      c.header("WWW-Authenticate", 'Basic realm="Roku Manager"');
      return c.json({ error: "Authentication required" }, 401);
    }
    return next();
  });

  const publicRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/server-time", (c) =>
    c.json({
      now: new Date().toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  );
  registerDeviceRoutes({ app, roku });
  registerSettingsRoutes({ app, store });
  registerEnforcerRoutes({ app, store, roku, enforcer, eventLog });

  // Serve the built web app and its assets. The web app uses hash routing, so
  // an explicit root route is enough and avoids returning index.html for
  // JavaScript and CSS requests.
  app.get("/assets/*", serveStatic({ root: publicRoot }));
  app.get("/", serveStatic({ root: publicRoot, path: "/index.html" }));
  serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000) }, (info) =>
    logger.info({ port: info.port }, "Roku Manager server started"),
  );
};
