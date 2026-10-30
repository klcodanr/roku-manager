import rootLogger from "./logger.js";
/** @typedef {import('./api').RokuDevice} RokuDevice */
/** @typedef {import('./api').DeviceSettings} DeviceSettings */
/** @typedef {import('./api').EnforcementSession} EnforcementSession */
/** @typedef {{ list: () => Promise<RokuDevice[]>, powerOff: (id: string) => Promise<void> }} RokuService */
/** @typedef {{ getSettings: (id: string) => DeviceSettings, getSession: (id: string) => EnforcementSession | undefined, setSession: (id: string, session: EnforcementSession) => Promise<void> }} EnforcementStore */
/** @typedef {{ append: (event: Record<string, unknown>) => Promise<void> }} EventLog */
/** @typedef {{ roku: RokuService, store: EnforcementStore, eventLog?: EventLog, clock?: () => Date }} EnforcerOptions */
/** @typedef {{ id: string, action: string, usedMinutes: number, lockedUntil: string | null }} EnforcementResult */

const logger = rootLogger.child({ component: "enforcement" });

/** @param {EnforcerOptions} options @returns {() => Promise<EnforcementResult[]>} */
export function createEnforcer({ roku, store, eventLog, clock = () => new Date() }) {
  let running = false;

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
        results.push(await enforceDevice({ device, roku, store, eventLog, now: clock() }));
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

/**
 * Converts a time string in HH:MM format to the number of minutes since midnight.
 * @param {string} value
 * @returns {number}
 */
function toMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

/** @param {{ device: RokuDevice, roku: RokuService, store: EnforcementStore, eventLog?: EventLog, now: Date }} options @returns {Promise<EnforcementResult>} */
async function enforceDevice({ device, roku, store, eventLog, now }) {
  const settings = store.getSettings(device.id);
  const active = Boolean(device.active && device.active.id !== "native-ui");
  const today = localDateKey(now);
  const previous = store.getSession(device.id);
  const session =
    previous?.date === today && "usedSeconds" in previous ? previous : newSession(today);
  if (typeof session.enforcementFailed !== "boolean") {
    session.enforcementFailed = false;
  }
  if (session.enforcementError === undefined) {
    session.enforcementError = null;
  }
  const elapsedSeconds =
    active && session.lastObservedAt
      ? Math.max(0, (now.getTime() - Date.parse(session.lastObservedAt)) / 1000)
      : 0;

  if (session.lockedUntil && now.getTime() >= Date.parse(session.lockedUntil)) {
    session.lockedUntil = null;
    session.usedSeconds = 0;
    session.lastObservedAt = active ? now.toISOString() : null;
  }

  const locked = session.lockedUntil && now.getTime() < Date.parse(session.lockedUntil);
  // Continue counting while a failed power-off leaves the Roku active.
  if (
    active &&
    (!locked || session.enforcementFailed) &&
    !isBlockedAt(settings.blockedWindows, now)
  ) {
    session.usedSeconds += elapsedSeconds;
  }
  session.lastObservedAt = active ? now.toISOString() : null;

  const maxSeconds = settings.maxMinutes === null ? null : settings.maxMinutes * 60;
  const limitReached = maxSeconds !== null && session.usedSeconds >= maxSeconds;
  const blocked = isBlockedAt(settings.blockedWindows, now);
  let action = "none";

  if (active && (blocked || locked || limitReached)) {
    try {
      logger.debug(
        { deviceId: device.id, blocked, locked, limitReached },
        "Enforcing device limits",
      );
      await roku.powerOff(device.id);
      action = blocked ? "powered_off_blocked_time" : "powered_off_daily_limit";
      session.enforcementFailed = false;
      session.enforcementError = null;
    } catch (error) {
      action = "power_off_failed";
      session.enforcementFailed = true;
      session.enforcementError = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, deviceId: device.id }, "Unable to enforce Roku policy");
    }
  }

  if (limitReached && !session.lockedUntil) {
    session.lockedUntil =
      settings.limitBehavior === "cooldown"
        ? new Date(now.getTime() + settings.cooldownMinutes * 60_000).toISOString()
        : nextLocalMidnight(now).toISOString();
  }

  await store.setSession(device.id, session);
  const result = {
    id: device.id,
    action,
    usedMinutes: Math.floor(session.usedSeconds / 60),
    lockedUntil: session.lockedUntil,
  };
  if (eventLog) {
    await eventLog.append({
      timestamp: now.toISOString(),
      deviceId: device.id,
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
