import { z } from "zod";

export const isoDatetimeToDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (isoString) => new Date(isoString),
  encode: (date) => date.toISOString(),
});

export const baseDeviceSchema = z.object({
  deviceId: z.string(),
  ip: z.url(),
});

export const appSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string(),
});

export const availableDeviceSchema = baseDeviceSchema.extend({
  info: z.looseObject({
    deviceId: z.string(),
    friendlyDeviceName: z.string(),
    modelName: z.string(),
    userDeviceLocation: z.string(),
  }),
  canPowerOff: z.boolean(),
  canControlVolume: z.boolean(),
  canSelectInput: z.boolean(),
  active: appSchema.nullable(),
  online: z.literal(true),
});

export const unavailableDeviceSchema = baseDeviceSchema.extend({
  error: z.string(),
  online: z.literal(false),
  info: availableDeviceSchema.shape.info.optional(),
  canPowerOff: z.boolean().optional(),
  canControlVolume: z.boolean().optional(),
  canSelectInput: z.boolean().optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
});

export const deviceSchema = z.union([availableDeviceSchema, unavailableDeviceSchema]);

export const enforcementSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lockedUntil: z.coerce.date().nullable(),
  usedSeconds: z.number(),
  lastActiveAt: isoDatetimeToDate.nullable(),
  lastObservedAt: isoDatetimeToDate.nullable(),
  enforcementFailed: z.boolean(),
  enforcementError: z.string().nullable(),
});

export const knownDeviceSchema = z.object({
  deviceId: z.string(),
  ip: z.url(),
  info: availableDeviceSchema.shape.info.optional(),
  canPowerOff: z.boolean().optional(),
  canControlVolume: z.boolean().optional(),
  canSelectInput: z.boolean().optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
});

export const deviceRuleSchema = z
  .object({
    name: z.string().min(1),
    days: z.array(z.number().min(0).max(6)).min(1).max(7),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    maxMinutes: z
      .number()
      .min(1)
      .max(24 * 60),
  })
  .and(
    z.union([
      z.object({
        limitBehavior: z.literal("cooldown"),
        cooldownMinutes: z
          .number()
          .min(1)
          .max(24 * 60),
      }),
      z.object({ limitBehavior: z.literal("rest_of_day") }),
    ]),
  );

export const deviceSettingsSchema = z.discriminatedUnion("enforcementEnabled", [
  z.object({
    deviceId: z.string(),
    enforcementEnabled: z.literal(true),
    rules: z.array(deviceRuleSchema).min(1),
  }),
  z.object({
    deviceId: z.string(),
    enforcementEnabled: z.literal(false),
    rules: z.array(deviceRuleSchema).default([]),
  }),
]);

export const enforcementActionSchema = z.enum(["none", "return_home", "power_off"]);

export const enforcementEventSchema = z.object({
  timestamp: isoDatetimeToDate,
  deviceId: z.string(),
  active: z.boolean(),
  appName: z.string().nullable(),
  enforcementStatus: z.enum(["failed", "none", "succeeded"]),
  enforcementAction: enforcementActionSchema,
  usedMinutes: z.number(),
  lockedUntil: isoDatetimeToDate.nullable(),
});

export const problemDetailsSchema = z.looseObject({
  status: z.number().min(200).max(504),
  type: z.string(),
  title: z.string(),
  detail: z.string(),
  instance: z.string(),
});

export const checkResultSchema = z.object({
  active: z.boolean(),
  inCooloff: z.boolean(),
  limitReached: z.boolean(),
  shouldUnlock: z.boolean(),
  expectedAction: enforcementActionSchema,
  expectedLockUntilDate: isoDatetimeToDate.nullable(),
});

export const eventsSummarySchema = z.object({
  total: z.number(),
  active: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  apps: z.record(z.string(), z.number()),
  series: z.array(
    z.object({
      timestamp: isoDatetimeToDate,
      usedMinutes: z.number(),
      enforcementStatus: z.enum(["failed", "none", "succeeded"]),
    }),
  ),
  recent: z.array(enforcementEventSchema).max(10),
});
