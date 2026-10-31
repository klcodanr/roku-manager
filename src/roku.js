import { RokuClient, Keys } from "roku-client";
import rootLogger from "./logger.js";

const logger = rootLogger.child({ module: "roku" });

/**
 * Promise to ensure that multiple discovery requests are not made simultaneously
 * @type {Promise<RokuClient[]>}
 */
let discoveryPromise;
const DISCOVERY_TIMEOUT = 10_000;
const DISCOVERY_RETRIES = 2;
const MAX_MISSED_DISCOVERIES = 2;

export class RokuService {
  /**
   * Mapping of the IDs to URLs
   * @type {Record<string, RokuClient>}
   */
  #clients;
  #missedDiscoveries;
  constructor() {
    this.#clients = {};
    this.#missedDiscoveries = {};
    this.lastDiscovery = 0;
  }

  /**
   * Converts the ID into a URL safe ID
   * @param {URL} ip
   */
  #toId(ip) {
    return Buffer.from(ip.toString()).toString("base64");
  }

  /**
   *
   * @param {boolean} force
   * @returns {Promise<RokuClient[]>}
   */
  async discover(force = false) {
    if (!force && Date.now() - this.lastDiscovery < 30_000 && Object.keys(this.#clients).length) {
      return Object.values(this.#clients);
    }
    if (discoveryPromise) {
      return discoveryPromise;
    }
    discoveryPromise = this.#discoverWithRetry();
    try {
      const clients = await discoveryPromise;
      const discovered = Object.fromEntries(
        clients.map((client) => [this.#toId(client.ip), client]),
      );

      for (const clientId of Object.keys(this.#clients)) {
        if (discovered[clientId]) {
          delete this.#missedDiscoveries[clientId];
        } else {
          this.#missedDiscoveries[clientId] = (this.#missedDiscoveries[clientId] ?? 0) + 1;
          if (this.#missedDiscoveries[clientId] > MAX_MISSED_DISCOVERIES) {
            delete this.#clients[clientId];
            delete this.#missedDiscoveries[clientId];
          }
        }
      }

      this.#clients = { ...this.#clients, ...discovered };
      logger.info({ clients: Object.keys(this.#clients) }, "Discovered Roku devices");
      this.lastDiscovery = Date.now();
      return Object.values(this.#clients);
    } catch (error) {
      if (!Object.keys(this.#clients).length) throw error;
      logger.warn({ err: error }, "Unable to refresh Roku discovery; using last known devices");
      this.lastDiscovery = Date.now();
      return Object.values(this.#clients);
    } finally {
      discoveryPromise = null;
    }
  }

  async #discoverWithRetry() {
    let error;
    for (let attempt = 0; attempt < DISCOVERY_RETRIES; attempt += 1) {
      try {
        return await RokuClient.discoverAll(DISCOVERY_TIMEOUT);
      } catch (currentError) {
        error = currentError;
        if (attempt + 1 < DISCOVERY_RETRIES) {
          logger.warn(
            { err: currentError, attempt: attempt + 1 },
            "Roku discovery failed; retrying",
          );
        }
      }
    }
    throw error;
  }

  /**
   *
   * @param {boolean} force
   * @returns {Promise<import('./api').RokuDevice[]>}
   */
  async list(force = false) {
    const clients = await this.discover(force);
    return Promise.all(
      clients.map(async (client) => {
        const clientId = this.#toId(client.ip);
        try {
          const [info, active] = await Promise.all([client.info(), client.active()]);
          return {
            clientId,
            deviceId: info.deviceId,
            ip: client.ip.toString(),
            info,
            canPowerOff: canPowerOff(info),
            active,
          };
        } catch (error) {
          logger.warn({ err: error, clientId }, "Unable to query Roku device");
          return { clientId, ip: client.ip.toString(), error: error.message };
        }
      }),
    );
  }

  /**
   * Return the stable identities of currently discovered devices for startup migration.
   * @returns {Promise<Array<{ clientId: string, deviceId: string }>>}
   */
  async deviceIdentities() {
    const clients = await this.discover();
    return Promise.all(
      clients.map(async (client) => ({
        clientId: this.#toId(client.ip),
        deviceId: (await client.info()).deviceId,
      })),
    );
  }

  /**
   * @param {string} id
   * @param {(import('roku-client').RokuDeviceInfo & { supportsTvPowerControl?: boolean }) | undefined} info
   * @returns {Promise<"powered_off" | "returned_home">}
   */
  async powerOff(clientId, info) {
    const client = this.#clients[clientId];
    if (!client) throw new Error("Device is not currently discovered");
    const deviceInfo = info ?? (await client.info());
    if (!canPowerOff(deviceInfo)) {
      await client.keypress(Keys.HOME.command);
      return "returned_home";
    }
    await client.keypress(Keys.POWER_OFF.command);
    return "powered_off";
  }
}

/** @param {(import('roku-client').RokuDeviceInfo & { supportsTvPowerControl?: boolean }) | undefined} info */
function canPowerOff(info) {
  return Boolean(info?.isTv || info?.supportsTvPowerControl);
}
