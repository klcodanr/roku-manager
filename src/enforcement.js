import rootLogger from "./logger.js";
/** @typedef {import('./api').RokuDevice} RokuDevice */
/** @typedef {import('./api').DeviceSettings} DeviceSettings */
/** @typedef {import('./api').EnforcementSession} EnforcementSession */
/** @typedef {{ list: () => Promise<RokuDevice[]>, powerOff: (id: string, info?: RokuDevice['info']) => Promise<"powered_off" | "returned_home"> }} RokuService */
/** @typedef {{ getSettings: (id: string) => DeviceSettings, getSession: (id: string) => EnforcementSession | undefined, setSession: (id: string, session: EnforcementSession) => Promise<void> }} EnforcementStore */
/** @typedef {{ append: (event: Record<string, unknown>) => Promise<void> }} EventLog */
/** @typedef {{ roku: RokuService, store: EnforcementStore, eventLog?: EventLog, clock?: () => Date, recheckDelayMs?: number, recheckAttempts?: number }} EnforcerOptions */
/** @typedef {{ deviceId: string, action: string, usedMinutes: number, lockedUntil: string | null }} EnforcementResult */

const logger = rootLogger.child({ component: "enforcement" });

/** @param {EnforcerOptions} options @returns {() => Promise<EnforcementResult[]>} */
export function createEnforcer({
  roku,
  store,
  eventLog,
  clock = () => new Date(),
  recheckDelayMs = 1_000,
  recheckAttempts = 3,
}) {
  let running = false;
  const pendingRechecks = new Set();

  /** @param {RokuDevice} device @param {number} attempt */
  function scheduleRecheck(device, attempt = 1) {
    const { deviceId } = device;
    if (pendingRechecks.has(deviceId)) return;
    pendingRechecks.add(deviceId);
    const timer = setTimeout(async () => {
      try {
        pendingRechecks.delete(deviceId);
        if (running) {
          scheduleRecheck(device, attempt);
          return;
        }
        await enforceDevice({
          device,
          roku,
          store,
          eventLog,
          now: clock(),
          onEnforced:
            attempt < recheckAttempts ? () => scheduleRecheck(device, attempt + 1) : undefined,
        });
      } catch (error) {
        logger.error({ err: error, deviceId }, "Scheduled device recheck failed");
      }
    }, recheckDelayMs);
    timer.unref();
  }

  /** @returns {Promise<EnforcementResult[]>} */
  return async function enforce() {
    if (running) {
      return [];
    }
    logger.debug("Starting enforcement run");
    running = true;
    try {
      const devices = await roku.list();
      const results = [];
      for (const device of devices) {
        results.push(
          await enforceDevice({
            device,
            roku,
            store,
            eventLog,
            now: clock(),
            onEnforced: () => scheduleRecheck(device),
          }),
        );
      }
      logger.debug({ results }, "Enforcement run results");
      return results;
    } finally {
      running = false;
      logger.debug("Finished enforcement run");
    }
  };
}

/**
 * Checks if the given date falls within any of the specified block windows.
 * @param {import('./api').BlockWindow[]} windows
 * @param {Date} date
 * @returns {boolean}
 */
export function isBlockedAt(windows, date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return windows.some(({ start, end }) => {
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    return startMinutes < endMinutes
      ? minutes >= startMinutes && minutes < endMinutes
      : minutes >= startMinutes || minutes < endMinutes;
  });
}

/** @param {import('./api').DeviceSettings} settings @param {Date} date @returns {import('./api').DeviceRule | null} */
export function matchingRule(settings, date = new Date()) {
  if (Array.isArray(settings.rules) && settings.rules.length) {
    const day = date.getDay();
    const previousDay = (day + 6) % 7;
    const minutes = date.getHours() * 60 + date.getMinutes();
    return (
      settings.rules.find((rule) => {
        const start = toMinutes(rule.start);
        const end = toMinutes(rule.end);
        if (start < end) return rule.days.includes(day) && minutes >= start && minutes < end;
        return (
          (rule.days.includes(day) && minutes >= start) ||
          (rule.days.includes(previousDay) && minutes < end)
        );
      }) ?? null
    );
  }
  return {
    name: "Legacy rule",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "00:00",
    end: "00:00",
    maxMinutes: settings.maxMinutes,
    limitBehavior: settings.limitBehavior,
    cooldownMinutes: settings.cooldownMinutes,
  };
}

/**
 * Converts a time string in HH:MM format to the number of minutes since midnight.
 * @param {string} value
 * @returns {number}
 */
function toMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

/** @param {{ device: RokuDevice, roku: RokuService, store: EnforcementStore, eventLog?: EventLog, now: Date, onEnforced?: () => void }} options @returns {Promise<EnforcementResult>} */
async function enforceDevice({ device, roku, store, eventLog, now, onEnforced }) {
  const deviceId = device.deviceId;
  const settings = store.getSettings(deviceId);
  const rule = matchingRule(settings, now);
  const active = Boolean(
    device.active &&
    device.active.id !== "native-ui" &&
    device.active.id !== "Roku Dynamic Menu" &&
    device.active.name !== "Roku Dynamic Menu",
  );
  const today = localDateKey(now);
  const previous = store.getSession(deviceId);
  const session =
    previous?.date === today && "usedSeconds" in previous ? previous : newSession(today);
  if (typeof session.enforcementFailed !== "boolean") {
    session.enforcementFailed = false;
  }
  if (session.enforcementError === undefined) {
    session.enforcementError = null;
  }
  const elapsedSeconds =
    active && rule && session.lastObservedAt
      ? Math.max(0, (now.getTime() - Date.parse(session.lastObservedAt)) / 1000)
      : 0;

  if (session.lockedUntil && now.getTime() >= Date.parse(session.lockedUntil)) {
    session.lockedUntil = null;
    session.usedSeconds = 0;
    session.lastObservedAt = active && rule ? now.toISOString() : null;
  }

  const locked = session.lockedUntil && now.getTime() < Date.parse(session.lockedUntil);
  // Continue counting while a failed power-off leaves the Roku active.
  if (active && (!locked || session.enforcementFailed) && Boolean(rule)) {
    session.usedSeconds += elapsedSeconds;
  }
  session.lastObservedAt = active && rule ? now.toISOString() : null;

  const maxSeconds = rule?.maxMinutes === null || !rule ? null : rule.maxMinutes * 60;
  const limitReached = maxSeconds !== null && session.usedSeconds >= maxSeconds;
  const blocked = false;
  let action = "none";

  if (active && (blocked || locked || limitReached)) {
    try {
      logger.debug({ deviceId, blocked, locked, limitReached }, "Enforcing device limits");
      const powerAction = await roku.powerOff(device.clientId, device.info);
      action =
        powerAction === "returned_home"
          ? "returned_home"
          : blocked
            ? "powered_off_blocked_time"
            : "powered_off_daily_limit";
      session.enforcementFailed = false;
      session.enforcementError = null;
    } catch (error) {
      action = "power_off_failed";
      session.enforcementFailed = true;
      session.enforcementError = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, deviceId }, "Unable to enforce Roku policy");
    }
    onEnforced?.();
  }

  if (limitReached && !session.lockedUntil) {
    session.lockedUntil =
      rule?.limitBehavior === "cooldown"
        ? new Date(now.getTime() + (rule?.cooldownMinutes ?? 15) * 60_000).toISOString()
        : nextLocalMidnight(now).toISOString();
  }

  await store.setSession(deviceId, session);
  const result = {
    deviceId,
    action,
    usedMinutes: Math.floor(session.usedSeconds / 60),
    lockedUntil: session.lockedUntil,
  };
  if (eventLog) {
    await eventLog.append({
      timestamp: now.toISOString(),
      deviceId,
      active,
      appName: device.active?.name ?? null,
      enforcementStatus: session.enforcementFailed
        ? "failed"
        : action === "none"
          ? "none"
          : "succeeded",
      enforcementEvent: action,
      usedMinutes: result.usedMinutes,
      lockedUntil: result.lockedUntil,
    });
  }
  return result;
}

/** @param {string} date @returns {EnforcementSession} */
function newSession(date) {
  return {
    date,
    usedSeconds: 0,
    lastObservedAt: null,
    lockedUntil: null,
    enforcementFailed: false,
    enforcementError: null,
  };
}

/** @param {Date} date @returns {string} */
function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** @param {Date} date @returns {Date} */
function nextLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** @param {() => Promise<EnforcementResult[]>} enforce @param {{ intervalMs: number, }} options @returns {() => void} */
export function startEnforcement(enforce, { intervalMs }) {
  logger.info({ intervalMs }, "Starting enforcement loop");
  const interval = setInterval(
    () => enforce().catch((error) => logger.error({ err: error }, "Scheduled enforcement failed")),
    intervalMs,
  );
  interval.unref();
  return () => clearInterval(interval);
}
