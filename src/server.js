import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import rootLogger from "./logger.js";
import { validateSettings } from "./store.js";
import { isBlockedAt } from "./enforcement.js";

const logger = rootLogger.child({ module: "server" });

/**
 *
 * @param {{ roku: import('./roku.js').RokuService, store: import('./store.js').Store, enforce: () => Promise<import('./enforcement.js').EnforcementResult[]>, eventLog: import('./event-log.js').EventLog }} options
 */
export const startServer = ({ roku, store, enforce, eventLog }) => {
  const app = new Hono();
  const username = process.env.AUTH_USER || "admin";
  const password = process.env.AUTH_PASSWORD || "change-me";

  if (!process.env.AUTH_PASSWORD) {
    logger.warn("AUTH_PASSWORD is not set; using the development password change-me");
  }

  app.use(
    pinoLogger({
      pino: pino({ level: "info" }),
    }),
  );

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
  app.use("/*", serveStatic({ root: publicRoot }));
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/devices", async (c) => {
    const devices = await roku.list(c.req.query("refresh") === "true");
    return c.json({ devices });
  });
  app.get("/api/devices/:id/settings", (c) => c.json(store.getSettings(c.req.param("id"))));
  app.get("/api/devices/:id/session", async (c) => {
    const id = c.req.param("id");
    const device = (await roku.list()).find((item) => item.id === id);
    return c.json(getSessionSummary(store, id, device, new Date()));
  });
  app.delete("/api/devices/:id/session", async (c) => {
    await store.resetSession(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/devices/:id/events", async (c) => {
    const allEvents = await eventLog.readAll(c.req.param("id"));
    return c.json({ events: allEvents.slice(-10), metrics: summarizeEvents(allEvents) });
  });
  app.put("/api/devices/:id/settings", async (c) => {
    const body = await c.req.json();
    const error = validateSettings(body);
    if (error) {
      return c.json({ error }, 400);
    }
    return c.json(
      await store.setSettings(c.req.param("id"), {
        maxMinutes: body.maxMinutes,
        blockedWindows: body.blockedWindows,
        limitBehavior: body.limitBehavior,
        cooldownMinutes: body.cooldownMinutes ?? 15,
      }),
    );
  });
  app.delete("/api/devices/:id/settings", async (c) => {
    return c.json(await store.resetSettings(c.req.param("id")));
  });
  app.post("/api/enforce", async (c) => c.json({ results: await enforce() }));
  app.get("*", serveStatic({ root: publicRoot, rewriteRequestPath: () => "/index.html" }));
  serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000) }, (info) =>
    logger.info({ port: info.port }, "Roku Manager server started"),
  );
};

/** @param {Array<Record<string, unknown>>} events */
export function summarizeEvents(events) {
  const apps = {};
  let active = 0;
  let succeeded = 0;
  let failed = 0;

  for (const event of events) {
    if (event.active) {
      active += 1;
      const appName =
        typeof event.appName === "string" && event.appName ? event.appName : "Unknown app";
      apps[appName] = (apps[appName] || 0) + 1;
    }
    if (event.enforcementStatus === "succeeded") succeeded += 1;
    if (event.enforcementStatus === "failed") failed += 1;
  }

  return {
    total: events.length,
    active,
    idle: events.length - active,
    succeeded,
    failed,
    notNeeded: events.length - succeeded - failed,
    apps,
    series: events.map((event) => ({
      timestamp: event.timestamp,
      usedMinutes: event.usedMinutes,
      enforcementStatus: event.enforcementStatus,
    })),
  };
}

/**
 * @param {import('./store.js').Store} store
 * @param {string} id
 * @param {import('./api').RokuDevice | undefined} device
 * @param {Date} now
 * @returns {import('./api').SessionSummary}
 */
function getSessionSummary(store, id, device, now) {
  const session = store.getSession(id);
  if (!session || session.date !== localDateKey(now)) {
    return {
      totalSeconds: 0,
      actual: actualState(device),
      expected: { state: "none", endsAt: null, remainingSeconds: 0 },
      enforcement: { state: "none", detail: null },
    };
  }

  const settings = store.getSettings(id);
  const active = Boolean(device?.active && device.active.id !== "native-ui");
  const blocked = isBlockedAt(settings.blockedWindows, now);
  const lockEndsAt = session.lockedUntil ? new Date(session.lockedUntil) : null;
  const lockActive = lockEndsAt && lockEndsAt.getTime() > now.getTime();
  const lockExpired = Boolean(lockEndsAt && !lockActive);

  const currentSeconds =
    !lockExpired && active && !blocked && !lockActive && session.lastObservedAt
      ? Math.max(0, (now.getTime() - Date.parse(session.lastObservedAt)) / 1000)
      : 0;
  const totalSeconds = lockExpired ? 0 : Math.floor(session.usedSeconds + currentSeconds);
  const limitReached = settings.maxMinutes !== null && totalSeconds >= settings.maxMinutes * 60;
  const blockEndsAt = blocked ? nextBlockEnd(settings.blockedWindows, now) : null;
  const limitEndsAt = limitReached
    ? settings.limitBehavior === "cooldown"
      ? lockActive
        ? lockEndsAt
        : new Date(now.getTime() + settings.cooldownMinutes * 60_000)
      : nextLocalMidnight(now)
    : null;
  const expectedState = lockActive
    ? settings.limitBehavior === "cooldown"
      ? "cooldown"
      : "daily_limit"
    : blocked
      ? "blocked"
      : limitReached
        ? "daily_limit"
        : "none";
  const endsAt = lockActive ? lockEndsAt : blockEndsAt || limitEndsAt;
  return {
    totalSeconds,
    actual: actualState(device),
    expected: {
      state: expectedState,
      endsAt: endsAt?.toISOString() ?? null,
      remainingSeconds: endsAt
        ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000))
        : 0,
    },
    enforcement: {
      state:
        session.enforcementFailed && active && expectedState !== "none"
          ? "failed"
          : expectedState !== "none" && active
            ? "succeeded"
            : "none",
      detail:
        session.enforcementFailed && active && expectedState !== "none"
          ? `Power off failed: ${session.enforcementError || "Unknown error"}`
          : null,
    },
  };
}

/** @param {import('./api').RokuDevice | undefined} device @returns {import('./api').SessionSummary['actual']} */
function actualState(device) {
  if (!device) return { state: "unknown", appName: null };
  if (!device.active || device.active.id === "native-ui") return { state: "idle", appName: null };
  return { state: "active", appName: device.active.name };
}

/** @param {Date} date @returns {Date} */
function nextLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** @param {Array<{ start: string, end: string }>} windows @param {Date} date @returns {Date} */
function nextBlockEnd(windows, date) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const currentSeconds = currentMinutes * 60 + date.getSeconds();
  const candidates = windows
    .map(({ start, end }) => {
      const startMinutes = timeMinutes(start);
      const endMinutes = timeMinutes(end);
      const active =
        startMinutes < endMinutes
          ? currentMinutes >= startMinutes && currentMinutes < endMinutes
          : currentMinutes >= startMinutes || currentMinutes < endMinutes;
      if (!active) return null;
      let secondsUntil = endMinutes * 60 - currentSeconds;
      if (secondsUntil <= 0) secondsUntil += 24 * 60 * 60;
      return new Date(date.getTime() + secondsUntil * 1000);
    })
    .filter((value) => value);
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

/** @param {string} value @returns {number} */
function timeMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** @param {Date} date @returns {string} */
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
