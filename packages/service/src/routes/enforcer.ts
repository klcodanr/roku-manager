import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  checkResultSchema,
  enforcementSessionSchema,
  eventsSummarySchema,
} from "@roku-manager/core";

import { apiProblemContent } from "../error.js";
import type { Enforcer } from "../lib/enforcer.js";
import type { EventLog } from "../lib/event-log.js";
import type { RokuService } from "../lib/roku.js";
import type { Store } from "../lib/store.js";
import { summarizeEventSeries } from "../lib/event-history.js";

export const registerEnforcerRoutes = ({
  app,
  store,
  enforcer,
  roku,
  eventLog,
}: {
  app: OpenAPIHono;
  store: Store;
  enforcer: Enforcer;
  roku: RokuService;
  eventLog: EventLog;
}) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/devices/{deviceId}/session",
      request: {
        params: z.object({
          deviceId: z.string().min(1),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                session: enforcementSessionSchema,
                status: checkResultSchema,
              }),
            },
          },
          description: "Retrieve the session for a specific Roku device",
        },
        401: {
          content: apiProblemContent,
          description: "Missing authentication",
        },
        403: {
          content: apiProblemContent,
          description: "Forbidden",
        },
      },
    }),
    async (c) => {
      const { deviceId } = c.req.valid("param");
      const session = store.getSession(deviceId);
      const device = await roku.get(deviceId);

      const status = await enforcer.checkDevice(device, new Date());
      return c.json({ session, status }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/devices/{deviceId}/session",
      request: {
        params: z.object({
          deviceId: z.string().min(1),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                session: enforcementSessionSchema,
                status: checkResultSchema,
              }),
            },
          },
          description: "Reset the session for a specific Roku device",
        },
        401: {
          content: apiProblemContent,
          description: "Missing authentication",
        },
        403: {
          content: apiProblemContent,
          description: "Forbidden",
        },
      },
    }),
    async (c) => {
      const { deviceId } = c.req.valid("param");
      const device = await roku.get(deviceId);
      await store.resetSession(deviceId);
      const status = await enforcer.checkDevice(device, new Date());
      return c.json({ session: store.getSession(deviceId), status }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/devices/{deviceId}/events",
      request: {
        params: z.object({
          deviceId: z.string().min(1),
        }),
        query: z.object({
          dayLimit: z.coerce.number().min(1).default(7),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: eventsSummarySchema,
            },
          },
          description: "Get events for a specific Roku device",
        },
        401: {
          content: apiProblemContent,
          description: "Missing authentication",
        },
        403: {
          content: apiProblemContent,
          description: "Forbidden",
        },
      },
    }),
    async (c) => {
      const { deviceId } = c.req.valid("param");
      const { dayLimit } = c.req.valid("query");

      const apps: Record<string, number> = {};
      let active = 0;
      let succeeded = 0;
      let failed = 0;

      const events = (await eventLog.readEvents({ deviceId, dayLimit })).sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
      for (const event of events) {
        if (event.active) {
          active += 1;
          const appName = event.appName ? event.appName : "Unknown app";
          apps[appName] = (apps[appName] || 0) + 1;
        }
        if (event.enforcementStatus === "succeeded") {
          succeeded += 1;
        }
        if (event.enforcementStatus === "failed") {
          failed += 1;
        }
      }

      const summary = {
        total: events.length,
        active,
        idle: events.length - active,
        succeeded,
        failed,
        apps,
        recent: events
          .filter((event, index) => {
            if (index === 0) return true;
            const previous = events[index - 1];
            const lockedUntil = event.lockedUntil?.getTime() ?? null;
            const previousLockedUntil = previous.lockedUntil?.getTime() ?? null;
            return (
              event.active !== previous.active ||
              event.appName !== previous.appName ||
              event.enforcementStatus !== previous.enforcementStatus ||
              event.enforcementAction !== previous.enforcementAction ||
              lockedUntil !== previousLockedUntil
            );
          })
          .slice(-10),
        series: summarizeEventSeries(events),
      };
      return c.json(summary, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/enforce",
      responses: {
        202: {
          description: "Enforce rules for Roku devices",
        },
        401: {
          content: apiProblemContent,
          description: "Missing authentication",
        },
        403: {
          content: apiProblemContent,
          description: "Forbidden",
        },
      },
    }),
    async (c) => {
      await enforcer.enforce();
      return c.body(null, 202);
    },
  );
};
