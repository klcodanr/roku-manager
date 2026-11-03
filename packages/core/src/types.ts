import { type z } from "zod";

export type AvailableRokuDevice = z.infer<typeof import("./schemas").availableDeviceSchema>;
export type RokuDevice = z.infer<typeof import("./schemas").deviceSchema>;
export type EnforcementSession = z.infer<typeof import("./schemas").enforcementSessionSchema>;
export type KnownDevice = z.infer<typeof import("./schemas").knownDeviceSchema>;
export type DeviceRule = z.infer<typeof import("./schemas").deviceRuleSchema>;
export type DeviceSettings = z.infer<typeof import("./schemas").deviceSettingsSchema>;
export type EnforcementAction = z.infer<typeof import("./schemas").enforcementActionSchema>;
export type EnforcementEvent = z.infer<typeof import("./schemas").enforcementEventSchema>;
export type CheckResult = z.infer<typeof import("./schemas").checkResultSchema>;
export type EventsSummary = z.infer<typeof import("./schemas").eventsSummarySchema>;
export type RokuApp = z.infer<typeof import("./schemas").appSchema>;
