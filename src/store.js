import fs from "node:fs/promises";
import path from "node:path";

const emptyState = () => ({ settings: {}, sessions: {}, devices: {} });

export class Store {
  /**
   * The internal state of the store.
   * @type {{ settings: Record<string, import('./api').DeviceSettings>, sessions: Record<string, import('./api').EnforcementSession> }}
   */
  #state;
  /**
   * @param {string} filePath
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.#state = emptyState();
  }

  async load() {
    try {
      this.#state = { ...emptyState(), ...JSON.parse(await fs.readFile(this.filePath, "utf8")) };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code !== "ENOENT"
      ) {
        throw error;
      }
      await this.save();
    }
    return this.#state;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.#state, null, 2));
    await fs.rename(temporaryPath, this.filePath);
  }

  /**
   * @param {string} id
   * @returns {import('./api').DeviceSettings}
   */
  getSettings(id) {
    return {
      maxMinutes: null,
      blockedWindows: [],
      limitBehavior: "rest_of_day",
      cooldownMinutes: 15,
      ...this.#state.settings[id],
      deviceId: id,
    };
  }

  /**
   * @param {string} id
   * @param {import('./api').DeviceSettings} settings
   * @returns  {Promise<import('./api').DeviceSettings>}
   */
  async setSettings(id, settings) {
    this.#state.settings[id] = { ...this.getSettings(id), ...settings, deviceId: id };
    await this.save();
    return this.#state.settings[id];
  }

  /**
   * Move data written by the old IP-based identity to the stable Roku identity.
   * @param {string} oldId
   * @param {string} deviceId
   */
  async migrateDevice(oldId, deviceId) {
    if (oldId === deviceId) return;
    let changed = false;
    for (const collection of [this.#state.settings, this.#state.sessions]) {
      if (collection[oldId] !== undefined) {
        if (collection[deviceId] === undefined) collection[deviceId] = { ...collection[oldId] };
        delete collection[oldId];
        changed = true;
      }
    }
    if (this.#state.settings[deviceId]) {
      this.#state.settings[deviceId].deviceId = deviceId;
      delete this.#state.settings[deviceId].id;
    }
    if (changed) await this.save();
  }

  /**
   * @param {string} id
   * @returns {Promise<import('./api').DeviceSettings>}
   */
  async resetSettings(id) {
    delete this.#state.settings[id];
    delete this.#state.sessions[id];
    await this.save();
    return this.getSettings(id);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async resetSession(id) {
    delete this.#state.sessions[id];
    await this.save();
  }

  /**
   * @param {string} id
   * @returns {import('./api').EnforcementSession | undefined}
   */
  getSession(id) {
    return this.#state.sessions[id];
  }

  /**
   * @param {string} id
   * @param {any} session
   */
  async setSession(id, session) {
    this.#state.sessions[id] = session;
    await this.save();
  }

  /** @returns {import('./api').KnownDevice[]} */
  getDevices() {
    return Object.values(this.#state.devices);
  }

  /**
   * @param {import('./api').KnownDevice} device
   * @returns {Promise<import('./api').KnownDevice>}
   */
  async setDevice(device) {
    this.#state.devices[device.id] = device;
    await this.save();
    return device;
  }
}

/**
 *
 * @param {*} body
 * @returns {string | null}
 */
export function validateSettings(body) {
  if (body.maxMinutes !== null && (!Number.isInteger(body.maxMinutes) || body.maxMinutes < 0)) {
    return "maxMinutes must be null or a non-negative integer";
  }
  if (!Array.isArray(body.blockedWindows)) {
    return "blockedWindows must be an array";
  }
  if (!["rest_of_day", "cooldown"].includes(body.limitBehavior)) {
    return "limitBehavior must be rest_of_day or cooldown";
  }
  if (
    body.cooldownMinutes !== undefined &&
    body.cooldownMinutes !== null &&
    (!Number.isInteger(body.cooldownMinutes) || body.cooldownMinutes < 1)
  ) {
    return "cooldownMinutes must be a positive integer";
  }
  for (const window of body.blockedWindows) {
    if (!window || !/^\d{2}:\d{2}$/.test(window.start) || !/^\d{2}:\d{2}$/.test(window.end)) {
      return "blockedWindows entries must have start and end in HH:MM format";
    }
    if (
      [window.start, window.end].some((time) => {
        const [hour, minute] = time.split(":").map(Number);
        return hour > 23 || minute > 59;
      })
    )
      return "blockedWindows times must be valid times";
  }
  return null;
}
