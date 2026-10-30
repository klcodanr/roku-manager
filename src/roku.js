import { RokuClient, Keys } from "roku-client";
import rootLogger from "./logger.js";

const logger = rootLogger.child({ module: "roku" });

/**
 * Promise to ensure that multiple discovery requests are not made simultaneously
 * @type {Promise<RokuClient[]>}
 */
let discoveryPromise;

export class RokuService {
  /**
   * Mapping of the IDs to URLs
   * @type {Record<string, RokuClient>}
   */
  #clients;
  constructor() {
    this.#clients = {};
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
    discoveryPromise = RokuClient.discoverAll(3_000);
    const clients = await discoveryPromise;
    discoveryPromise = null;
    this.#clients = Object.fromEntries(clients.map((client) => [this.#toId(client.ip), client]));
    logger.info({ clients: Object.keys(this.#clients) }, "Discovered Roku devices");
    this.lastDiscovery = Date.now();
    return clients;
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
        const id = this.#toId(client.ip);
        try {
          const [info, active] = await Promise.all([client.info(), client.active()]);
          return { id, ip: client.ip.toString(), info, canPowerOff: canPowerOff(info), active };
        } catch (error) {
          logger.warn({ err: error, id }, "Unable to query Roku device");
          return { id, ip: client.ip.toString(), error: error.message };
        }
      }),
    );
  }

  /**
   * @param {string} id
   * @param {(import('roku-client').RokuDeviceInfo & { supportsTvPowerControl?: boolean }) | undefined} info
   * @returns {Promise<"powered_off" | "returned_home">}
   */
  async powerOff(id, info) {
    const client = this.#clients[id];
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
