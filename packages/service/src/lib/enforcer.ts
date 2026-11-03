import type {
  AvailableRokuDevice,
  CheckResult,
  DeviceSettings,
  EnforcementAction,
} from "@roku-manager/core";
import rootLogger from "../logger.js";
import type { EventLog } from "./event-log.js";
import type { RokuService } from "./roku.js";
import type { Store } from "./store.js";

const logger = rootLogger.child({ component: "enforcement" });

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const nextLocalMidnight = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
};

export function matchingRule(settings: DeviceSettings, date: Date) {
  const day = date.getDay();
  const previousDay = (day + 6) % 7;
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (
    settings.rules.find((rule) => {
      const start = toMinutes(rule.start);
      const end = toMinutes(rule.end);
      if (start < end) {
        return rule.days.includes(day) && minutes >= start && minutes < end;
      }
      return (
        (rule.days.includes(day) && minutes >= start) ||
        (rule.days.includes(previousDay) && minutes < end)
      );
    }) ?? null
  );
}

export type EnforcerOptions = {
  roku: RokuService;
  store: Store;
  eventLog: EventLog;
  recheckDelayMs: number;
  recheckAttempts: number;
};

export class Enforcer {
  private readonly eventLog: EventLog;
  private readonly rokuService: RokuService;
  private readonly store: Store;
  private readonly recheckDelayMs: number;
  private readonly recheckAttempts: number;

  private readonly pendingRechecks = new Set<string>();
  private running = false;

  constructor({ roku, store, eventLog, recheckDelayMs, recheckAttempts }: EnforcerOptions) {
    this.eventLog = eventLog;
    this.rokuService = roku;
    this.store = store;
    this.recheckDelayMs = recheckDelayMs;
    this.recheckAttempts = recheckAttempts;
  }

  private scheduleRecheck(device: AvailableRokuDevice, attempt = 1) {
    const { deviceId } = device;
    if (this.pendingRechecks.has(deviceId)) {
      return;
    }
    this.pendingRechecks.add(deviceId);
    const timer = setTimeout(async () => {
      try {
        this.pendingRechecks.delete(deviceId);
        if (this.running) {
          this.scheduleRecheck(device, attempt);
          return;
        }
        this.running = true;
        await this.doEnforceDevice(device, new Date(), attempt + 1);
      } catch (error) {
        logger.error({ err: error, deviceId }, "Scheduled device recheck failed");
      } finally {
        this.running = false;
      }
    }, this.recheckDelayMs);
    timer.unref();
  }

  private async doEnforceDevice(device: AvailableRokuDevice, now: Date, attempt: number) {
    const { active, inCooloff, limitReached, shouldUnlock, expectedAction, expectedLockUntilDate } =
      await this.checkDevice(device, now);

    const session = this.store.getSession(device.deviceId);

    if (active) {
      const elapsedSeconds = session.lastObservedAt
        ? Math.max(0, (now.getTime() - session.lastObservedAt.getTime()) / 1000)
        : 0;
      session.usedSeconds += elapsedSeconds;
      session.lastActiveAt = now;
    }
    session.lastObservedAt = now;
    if (shouldUnlock) {
      session.lockedUntil = null;
      session.usedSeconds = 0;
    }

    if (active && (inCooloff || limitReached)) {
      try {
        logger.debug(
          { deviceId: device.deviceId, inCooloff, limitReached },
          "Enforcing device limits",
        );
        await this.rokuService.powerOff(device);
        session.enforcementFailed = false;
        session.enforcementError = null;
        if (attempt < this.recheckAttempts) {
          this.scheduleRecheck(device, attempt);
        }
      } catch (error) {
        session.enforcementFailed = true;
        session.enforcementError = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, deviceId: device.deviceId }, "Unable to enforce Roku policy");
      }
    }

    if (limitReached && !session.lockedUntil) {
      session.lockedUntil = expectedLockUntilDate;
    }

    await this.store.setSession(device.deviceId, session);

    if (this.eventLog) {
      await this.eventLog.append({
        timestamp: now,
        deviceId: device.deviceId,
        active,
        appName: device.active?.name ?? null,
        enforcementStatus: session.enforcementFailed
          ? "failed"
          : expectedAction === "none"
            ? "none"
            : "succeeded",
        enforcementAction: expectedAction,
        usedMinutes: Math.floor(session.usedSeconds / 60),
        lockedUntil: session.lockedUntil,
      });
    }
  }

  async checkDevice(device: AvailableRokuDevice, now: Date = new Date()): Promise<CheckResult> {
    let shouldUnlock = false;
    const deviceId = device.deviceId;
    const settings = this.store.getSettingsOrDefault(deviceId);
    const active = Boolean(
      device.active &&
      device.active.id !== "native-ui" &&
      device.active.id !== "Roku Dynamic Menu" &&
      device.active.name !== "Roku Dynamic Menu",
    );
    const session = this.store.getSession(deviceId);

    if (!settings.enforcementEnabled) {
      return {
        active,
        inCooloff: false,
        limitReached: false,
        shouldUnlock: false,
        expectedAction: "none",
        expectedLockUntilDate: session.lockedUntil,
      };
    }

    const rule = matchingRule(settings, now);

    if (session.lockedUntil && now.getTime() >= session.lockedUntil.getTime()) {
      logger.debug({ deviceId }, "Unlocking device session due to expired lock");
      shouldUnlock = true;
    }

    const inCooloff = Boolean(session.lockedUntil && now.getTime() < session.lockedUntil.getTime());

    const maxSeconds = rule?.maxMinutes === null || !rule ? null : rule.maxMinutes * 60;
    const limitReached = maxSeconds !== null && session.usedSeconds >= maxSeconds;
    const blocked = false;
    let expectedAction: EnforcementAction = "none";

    if (active && (blocked || inCooloff || limitReached)) {
      expectedAction = device.canPowerOff ? "power_off" : "return_home";
    }

    let expectedLockUntilDate = session.lockedUntil;
    if (limitReached && !session.lockedUntil) {
      expectedLockUntilDate =
        rule?.limitBehavior === "cooldown"
          ? new Date(now.getTime() + (rule?.cooldownMinutes ?? 15) * 60_000)
          : nextLocalMidnight(now);
    }
    return {
      active,
      inCooloff,
      limitReached,
      shouldUnlock,
      expectedAction,
      expectedLockUntilDate,
    };
  }

  async enforce() {
    if (this.running) {
      return;
    }
    logger.debug("Starting enforcement run");
    this.running = true;
    try {
      const devices = await this.rokuService.list();
      for (const device of devices.filter((d) => "info" in d)) {
        await this.enforceDevice(device);
      }
    } finally {
      this.running = false;
      logger.debug("Finished enforcement run");
    }
  }

  async enforceDevice(device: AvailableRokuDevice) {
    return this.doEnforceDevice(device, new Date(), 1);
  }

  startBackgroundEnforcement(intervalMs: number) {
    const enforce = () =>
      this.enforce().catch((error) => logger.error({ err: error }, "Scheduled enforcement failed"));
    enforce();
    const interval = setInterval(enforce, intervalMs);
    interval.unref();
    return () => clearInterval(interval);
  }
}
