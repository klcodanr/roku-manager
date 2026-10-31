import { RokuDeviceInfo, RokuApp } from "roku-client";

export interface RokuDevice {
  clientId: string;
  deviceId: string;
  ip: string;
  info?: RokuDeviceInfo & { supportsTvPowerControl?: boolean };
  canPowerOff?: boolean;
  active?: RokuApp | null;
  error?: string;
}

export interface BlockWindow {
  start: string;
  end: string;
}

export interface DeviceSettings {
  deviceId: string;
  maxMinutes: number | null;
  blockedWindows: Array<BlockWindow>;
  limitBehavior: "rest_of_day" | "cooldown";
  cooldownMinutes: number;
}

export interface EnforcementSession {
  date: string;
  lockedUntil: string | null;
  usedSeconds: number;
  lastObservedAt: string | null;
  enforcementFailed: boolean;
  enforcementError: string | null;
}

export interface SessionSummary {
  totalSeconds: number;
  actual: {
    state: "active" | "idle" | "unknown";
    appName: string | null;
  };
  expected: {
    state: "none" | "blocked" | "daily_limit" | "cooldown";
    endsAt: string | null;
    remainingSeconds: number;
  };
  enforcement: {
    state: "none" | "succeeded" | "failed";
    detail: string | null;
  };
}
