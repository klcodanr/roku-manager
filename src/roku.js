import { RokuClient, Keys } from "roku-client";
import rootLogger from "./logger.js";

const logger = rootLogger.child({ module: "roku" });
const DISCOVERY_TIMEOUT = 10_000;
const DISCOVERY_RETRIES = 2;

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

  startDiscovery(intervalMs) {
    const scan = () =>
      this.scan().catch((error) => logger.warn({ err: error }, "Device scan failed"));
    scan();
    const interval = setInterval(scan, intervalMs);
    interval.unref();
    return () => clearInterval(interval);
  }

  async scan() {
    if (this.#scanPromise) return this.#scanPromise;
    this.#scanPromise = this.#scanWithRetry();
    try {
      await this.#scanPromise;
    } finally {
      this.#scanPromise = undefined;
    }
  }

  async #scanWithRetry() {
    let error;
    for (let attempt = 0; attempt < DISCOVERY_RETRIES; attempt += 1) {
      try {
        const clients = await RokuClient.discoverAll(DISCOVERY_TIMEOUT);
        await Promise.all(clients.map((client) => this.#register(client)));
        logger.info({ count: clients.length }, "Scanned for Roku devices");
        return;
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

  async add(ip) {
    const client = new RokuClient(ip);
    const { id, info } = await this.#register(client, true);
    return this.#details(id, client, info);
  }

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
            clientId: known.id,
            ip: known.ip,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }

  async #details(id, client, knownInfo) {
    const [info, active] = await Promise.all([knownInfo ?? client.info(), client.active()]);
    return {
      id,
      clientId: id,
      deviceId: info.deviceId || id,
      ip: client.ip.toString(),
      info,
      canPowerOff: canPowerOff(info),
      active,
    };
  }

  async deviceIdentities() {
    const clients = Object.values(this.#clients);
    return Promise.all(
      clients.map(async (client) => ({
        clientId: deviceId(await client.info(), client.ip),
        deviceId: (await client.info()).deviceId,
      })),
    );
  }

  async powerOff(clientId, info) {
    const client = this.#clients[clientId];
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

function deviceId(info, ip) {
  const stableId = info.serialNumber || info.deviceId;
  return stableId ? String(stableId) : Buffer.from(ip.toString()).toString("base64");
}

function canPowerOff(info) {
  return Boolean(info?.isTv || info?.supportsTvPowerControl);
}
