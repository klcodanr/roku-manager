import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { appSchema, deviceSchema } from "@roku-manager/core";
import { ProblemDetailsError } from "hono-problem-details";
import type { RokuService } from "../lib/roku";
import { REMOTE_COMMANDS } from "../lib/roku";

import { apiProblemContent } from "../error.js";
import rootLogger from "../logger.js";

const logger = rootLogger.child({ module: "routes/devices" });

export const registerDeviceRoutes = ({ app, roku }: { app: OpenAPIHono; roku: RokuService }) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/devices",
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                devices: z.array(deviceSchema),
              }),
            },
          },
          description: "Retrieve the list of Roku devices",
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
      if (c.req.query("refresh") === "true") {
        await roku.scan();
      }
      const devices = await roku.list();
      return c.json({ devices }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/devices/{deviceId}/apps",
      request: { params: z.object({ deviceId: z.string().min(1) }) },
      responses: {
        200: {
          content: { "application/json": { schema: z.object({ apps: z.array(appSchema) }) } },
          description: "List installed Roku apps",
        },
        404: { content: apiProblemContent, description: "Device not found" },
      },
    }),
    async (c) => c.json({ apps: await roku.apps(c.req.valid("param").deviceId) }, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/devices/{deviceId}/apps/{appId}/launch",
      request: {
        params: z.object({
          deviceId: z.string().min(1),
          appId: z.coerce.number().int().positive(),
        }),
      },
      responses: {
        204: { description: "App launched" },
        404: { content: apiProblemContent, description: "Device or app not found" },
      },
    }),
    async (c) => {
      const { deviceId, appId } = c.req.valid("param");
      await roku.launch(deviceId, appId);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/devices",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                ip: z.string().min(1),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          content: {
            "application/json": {
              schema: deviceSchema,
            },
          },
          description: "Add a new Roku device and return the newly added device",
        },
        401: {
          content: apiProblemContent,
          description: "Missing authentication",
        },
        403: {
          content: apiProblemContent,
          description: "Forbidden",
        },
        422: {
          content: apiProblemContent,
          description: "Failed to add a new Roku device",
        },
      },
    }),
    async (c) => {
      const { ip } = c.req.valid("json");
      try {
        return c.json(await roku.add(ip.trim()), 201);
      } catch (error) {
        logger.error({ err: error, ip }, "Failed to add device");
        throw new ProblemDetailsError({
          status: 422,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/devices/{deviceId}/remote",
      request: {
        params: z.object({ deviceId: z.string().min(1) }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                command: z.enum(Object.keys(REMOTE_COMMANDS) as [string, ...string[]]),
              }),
            },
          },
        },
      },
      responses: {
        204: { description: "Remote command sent" },
        404: { content: apiProblemContent, description: "Device not found" },
        422: { content: apiProblemContent, description: "Invalid remote command" },
      },
    }),
    async (c) => {
      const { deviceId } = c.req.valid("param");
      const { command } = c.req.valid("json");
      await roku.remote(deviceId, command as keyof typeof REMOTE_COMMANDS);
      return c.body(null, 204);
    },
  );
};
