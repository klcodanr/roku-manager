import { RokuClient, Keys } from "roku-client";
import rootLogger from "./logger.js";

const logger = rootLogger.child({ module: "roku" });
const DISCOVERY_TIMEOUT = 3_000;

/** @typedef {import('./api').KnownDevice} KnownDevice */

export class RokuService {
  /** @type {Record<string, RokuClient>} */
  #clients = {};
  /** @type {import('./store.js').Store} */
  #store;
  /** @type {Promise<unknown> | undefined} */
  #scanPromise;

  /** @param {{ store: import('./store.js').Store }} options */
  constructor({ store }) {
    this.#store = store;
    for (const device of store.getDevices()) this.#clients[device.id] = new RokuClient(device.ip);
  }

  /**
   * Periodically refreshes SSDP-discovered addresses. Direct IP queries do not
   * depend on this loop and continue to work between scans.
   * @param {number} intervalMs
   * @returns {() => void}
   */
  startDiscovery(intervalMs) {
    const scan = () =>
      this.scan().catch((error) => logger.warn({ err: error }, "Device scan failed"));
    scan();
    const interval = setInterval(scan, intervalMs);
    interval.unref();
    return () => clearInterval(interval);
  }

  /** @returns {Promise<void>} */
  async scan() {
    if (this.#scanPromise) return this.#scanPromise;
    this.#scanPromise = this.#scan();
    try {
      await this.#scanPromise;
    } finally {
      this.#scanPromise = undefined;
    }
  }

  async #scan() {
    const clients = await RokuClient.discoverAll(DISCOVERY_TIMEOUT);
    await Promise.all(clients.map((client) => this.#register(client)));
    logger.info({ count: clients.length }, "Scanned for Roku devices");
  }

  /** @param {RokuClient} client @param {boolean} manuallyAdded */
  async #register(client, manuallyAdded = false) {
    const info = await client.info();
    const id = deviceId(info, client.ip);
    this.#clients[id] = client;
    await this.#store.setDevice({
      id,
      ip: client.ip.toString(),
      ...(manuallyAdded ? { manuallyAdded: true } : {}),
    });
    return { id, client, info };
  }

  /** @param {string} ip @returns {Promise<import('./api').RokuDevice>} */
  async add(ip) {
    const client = new RokuClient(ip);
    const { id, info } = await this.#register(client, true);
    return this.#details(id, client, info);
  }

  /**
   * Queries known devices directly. A failed IP query triggers one SSDP scan,
   * then the known inventory is retried using any updated addresses.
   * @returns {Promise<import('./api').RokuDevice[]>}
   */
  async list() {
    let devices = await this.#listKnown();
    if (devices.some((device) => device.error)) {
      try {
        await this.scan();
        devices = await this.#listKnown();
      } catch (error) {
        logger.warn({ err: error }, "Unable to recover devices with SSDP scan");
      }
    }
    return devices;
  }

  async #listKnown() {
    return Promise.all(
      this.#store.getDevices().map(async (known) => {
        const client = (this.#clients[known.id] ??= new RokuClient(known.ip));
        try {
          return await this.#details(known.id, client);
        } catch (error) {
          logger.warn({ err: error, id: known.id, ip: known.ip }, "Unable to query Roku device");
          return {
            id: known.id,
            ip: known.ip,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }

  /** @param {string} id @param {RokuClient} client @param {object} [knownInfo] */
  async #details(id, client, knownInfo) {
    const [info, active] = await Promise.all([knownInfo ?? client.info(), client.active()]);
    return { id, ip: client.ip.toString(), info, canPowerOff: canPowerOff(info), active };
  }

  /** @param {string} id @param {import('roku-client').RokuDeviceInfo | undefined} info */
  async powerOff(id, info) {
    const client = this.#clients[id];
    if (!client) throw new Error("Device is not known");
    const deviceInfo = info ?? (await client.info());
    if (!canPowerOff(deviceInfo)) {
      await client.keypress(Keys.HOME.command);
      return "returned_home";
    }
    await client.keypress(Keys.POWER_OFF.command);
    return "powered_off";
  }
}

/** @param {import('roku-client').RokuDeviceInfo} info @param {URL} ip */
function deviceId(info, ip) {
  const stableId = info.serialNumber || info.deviceId;
  return stableId ? String(stableId) : Buffer.from(ip.toString()).toString("base64");
}

/** @param {(import('roku-client').RokuDeviceInfo & { supportsTvPowerControl?: boolean }) | undefined} info */
function canPowerOff(info) {
  return Boolean(info?.isTv || info?.supportsTvPowerControl);
}
