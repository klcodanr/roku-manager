import { RokuClient, Keys, type RokuDeviceInfo } from "roku-client";
import {
  availableDeviceSchema,
  type AvailableRokuDevice,
  type RokuDevice,
} from "@roku-manager/core";
import rootLogger from "../logger.js";
import { Store } from "./store.js";
import { HTTPException } from "hono/http-exception";

const logger = rootLogger.child({ module: "roku" });
const DISCOVERY_TIMEOUT = 10_000;

export const REMOTE_COMMANDS = {
  home: Keys.HOME.command,
  back: Keys.BACK.command,
  up: Keys.UP.command,
  down: Keys.DOWN.command,
  left: Keys.LEFT.command,
  right: Keys.RIGHT.command,
  select: Keys.SELECT.command,
  play: Keys.PLAY.command,
  volumeDown: Keys.VOLUME_DOWN.command,
  volumeUp: Keys.VOLUME_UP.command,
  volumeMute: Keys.VOLUME_MUTE.command,
  powerOn: Keys.POWER_ON.command,
  powerOff: Keys.POWER_OFF.command,
  reverse: Keys.REV.command,
  forward: Keys.FWD.command,
  options: Keys.OPTIONS.command,
  inputTuner: Keys.INPUT_TUNER.command,
  inputHdmi1: Keys.INPUT_HDMI1.command,
  inputHdmi2: Keys.INPUT_HDMI2.command,
  inputHdmi3: Keys.INPUT_HDMI3.command,
  inputHdmi4: Keys.INPUT_HDMI4.command,
} as const;

export type RemoteCommand = keyof typeof REMOTE_COMMANDS;

function canPowerOff(info: RokuDeviceInfo & { supportsTvPowerControl?: boolean }) {
  return Boolean(info.isTv || info.supportsTvPowerControl);
}

function canControlVolume(info: RokuDeviceInfo) {
  return info.isTv;
}

function canSelectInput(info: RokuDeviceInfo) {
  return info.isTv;
}

export class RokuService {
  private readonly clients: Record<string, RokuClient> = {};
  private readonly store: Store;
  private scanPromise: Promise<unknown> | undefined;

  constructor({ store }: { store: Store }) {
    this.store = store;
    for (const device of store.getDevices()) {
      this.clients[device.deviceId] = new RokuClient(device.ip);
    }
  }

  private async doScan() {
    const clients = await RokuClient.discoverAll(DISCOVERY_TIMEOUT);
    await Promise.all(
      clients.map(async (client) => {
        const info = await client.info();
        await this.register(client, info);
      }),
    );
    logger.info({ count: clients.length }, "Scanned for Roku devices");
  }

  private async listKnown(): Promise<RokuDevice[]> {
    return Promise.all(
      this.store.getDevices().map(async (known) => {
        const client = (this.clients[known.deviceId] ??= new RokuClient(known.ip));
        try {
          return await this.details(client);
        } catch (error) {
          logger.warn({ err: error, ...known }, "Unable to query Roku device");
          return {
            ...known,
            online: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }

  private async register(client: RokuClient, info: RokuDeviceInfo) {
    this.clients[info.deviceId] = client;
    await this.store.putDevice({
      deviceId: info.deviceId,
      ip: client.ip.toString(),
      info: availableDeviceSchema.shape.info.parse(info),
      canPowerOff: canPowerOff(info),
      canControlVolume: canControlVolume(info),
      canSelectInput: canSelectInput(info),
      lastSeenAt: new Date().toISOString(),
    });
  }

  async add(ip: string) {
    logger.info({ ip }, "Adding Roku device");
    const client = new RokuClient(ip);
    const info = await client.info();
    await this.register(client, info);
    return this.details(client, info);
  }

  async delete(deviceId: string) {
    logger.info({ deviceId }, "Removing Roku device");
    delete this.clients[deviceId];
    await this.store.deleteDevice(deviceId);
  }

  async get(deviceId: string) {
    let client = this.clients[deviceId];
    if (!client) {
      await this.scan();
      if (!(client = this.clients[deviceId])) {
        throw new Error("Device is not known");
      }
    }
    const info = await client.info();
    return this.details(client, info);
  }

  async list() {
    let devices = await this.listKnown();
    if (devices.some((device) => "error" in device)) {
      try {
        await this.scan();
        devices = await this.listKnown();
      } catch (error) {
        logger.warn({ err: error }, "Unable to recover devices with SSDP scan");
      }
    }
    return devices;
  }

  private async details(
    client: RokuClient,
    knownInfo?: RokuDeviceInfo,
  ): Promise<AvailableRokuDevice> {
    const [info, active] = await Promise.all([knownInfo ?? client.info(), client.active()]);
    return {
      deviceId: info.deviceId,
      ip: client.ip.toString(),
      info: availableDeviceSchema.shape.info.parse(info),
      canPowerOff: canPowerOff(info),
      canControlVolume: canControlVolume(info),
      canSelectInput: canSelectInput(info),
      active: active as AvailableRokuDevice["active"] | null,
      online: true,
    };
  }

  async powerOff(device: RokuDevice) {
    const client = this.clients[device.deviceId];
    if (!client) {
      throw new HTTPException(404, { message: "Device is not known" });
    }
    const deviceInfo = "info" in device ? device.info : await client.info();
    if (!canPowerOff(deviceInfo as RokuDeviceInfo)) {
      await client.keypress(Keys.HOME.command);
      return "return_home";
    }
    await client.keypress(Keys.POWER_OFF.command);
    return "power_off";
  }

  async remote(deviceId: string, command: RemoteCommand) {
    logger.debug({ deviceId, command }, "Sending Roku remote command");
    let client = this.clients[deviceId];
    if (!client) {
      await this.scan();
      client = this.clients[deviceId];
    }
    if (!client) {
      throw new HTTPException(404, { message: "Device is not known" });
    }
    await client.keypress(REMOTE_COMMANDS[command]);
  }

  private async clientFor(deviceId: string) {
    let client = this.clients[deviceId];
    if (!client) {
      await this.scan();
      client = this.clients[deviceId];
    }
    if (!client) throw new HTTPException(404, { message: "Device is not known" });
    return client;
  }

  async apps(deviceId: string) {
    logger.debug({ deviceId }, "Loading installed Roku apps");
    return (await this.clientFor(deviceId)).apps();
  }

  async launch(deviceId: string, appId: number) {
    logger.info({ deviceId, appId }, "Launching Roku app");
    await (await this.clientFor(deviceId)).launch(appId);
  }

  async scan() {
    if (this.scanPromise) {
      return this.scanPromise;
    }
    this.scanPromise = this.doScan();
    try {
      await this.scanPromise;
    } finally {
      this.scanPromise = undefined;
    }
  }

  startBackgroundDiscovery(intervalMs: number) {
    const scan = () =>
      this.scan().catch((error) => logger.warn({ err: error }, "Device scan failed"));
    scan();
    const interval = setInterval(scan, intervalMs);
    interval.unref();
    return () => clearInterval(interval);
  }
}
