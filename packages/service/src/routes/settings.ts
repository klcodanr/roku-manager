import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { deviceSettingsSchema } from "@roku-manager/core";
import { ProblemDetailsError } from "hono-problem-details";

import { apiProblemContent } from "../error.js";
import type { Store } from "../lib/store.js";

export const registerSettingsRoutes = ({ app, store }: { app: OpenAPIHono; store: Store }) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/devices/{deviceId}/settings",
      request: {
        params: z.object({
          deviceId: z.string().min(1),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: deviceSettingsSchema,
            },
          },
          description: "Retrieve the settings for a Roku device",
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
      return c.json(store.getSettingsOrDefault(deviceId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/devices/{deviceId}/settings",
      request: {
        body: {
          content: {
            "application/json": {
              schema: deviceSettingsSchema,
            },
          },
        },
        params: z.object({
          deviceId: z.string().min(1),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: deviceSettingsSchema,
            },
          },
          description: "Update the Roku device and return the updated device",
        },
        400: {
          content: apiProblemContent,
          description: "Bad Request",
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
      const settings = c.req.valid("json");
      const { deviceId } = c.req.valid("param");
      if (deviceId !== settings.deviceId) {
        throw new ProblemDetailsError({
          status: 400,
          title: "Bad Request",
          detail: "Device ID in the URL does not match the device ID in the request body",
        });
      }
      const updatedSettings = await store.setSettings(settings);
      return c.json(updatedSettings, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/devices/{deviceId}/settings",
      request: {
        params: z.object({
          deviceId: z.string().min(1),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: deviceSettingsSchema,
            },
          },
          description: "Update the Roku device and return the updated device",
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
      const reset = await store.resetSettings(deviceId);
      return c.json(reset, 200);
    },
  );
};
