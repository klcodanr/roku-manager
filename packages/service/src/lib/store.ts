import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import rootLogger from "../logger";
import { noEntityErrorSchema } from "../error";
import type { DeviceSettings, EnforcementSession, KnownDevice } from "@roku-manager/core";
import {
  deviceSettingsSchema,
  enforcementSessionSchema,
  knownDeviceSchema,
} from "@roku-manager/core";
import { z } from "zod";

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const emptyState = () => ({ settings: {}, sessions: {}, devices: {} });

const stateSchema = z.object({
  settings: z.record(z.string(), deviceSettingsSchema),
  sessions: z.record(z.string(), enforcementSessionSchema),
  devices: z.record(z.string(), knownDeviceSchema),
});

type State = z.infer<typeof stateSchema>;

const logger = rootLogger.child({ module: "store" });

export class Store {
  private filePath: string;
  private state: State;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = emptyState();
  }

  async load() {
    try {
      logger.debug({ filePath: this.filePath }, "Loading store from file");
      const content = await readFile(this.filePath, "utf8");
      this.state = stateSchema.parse({ ...emptyState(), ...JSON.parse(content) });

      logger.debug({ filePath: this.filePath }, "Loaded store from file");
    } catch (error) {
      if (!noEntityErrorSchema.safeParse(error).success) {
        logger.error({ filePath: this.filePath, err: error }, "Failed to load store from file");
        throw error;
      }
      logger.debug({ filePath: this.filePath }, "Store file not found, creating new one");
      await this.save();
    }
    return this.state;
  }

  private async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(stateSchema.encode(this.state), null, 2));
    await rename(temporaryPath, this.filePath);
  }

  async deleteDevice(deviceId: string): Promise<void> {
    delete this.state.devices[deviceId];
    await this.save();
  }

  getDevices(): KnownDevice[] {
    return Object.values(this.state.devices);
  }

  getSession(deviceId: string) {
    const today = localDateKey(new Date());
    const current = this.state.sessions[deviceId];
    if (current?.date === today) {
      return current;
    }
    return {
      date: today,
      usedSeconds: 0,
      lastActiveAt: null,
      lastObservedAt: new Date(),
      lockedUntil: null,
      enforcementFailed: false,
      enforcementError: null,
    };
  }

  getSettings(deviceId: string): DeviceSettings | undefined {
    return this.state.settings[deviceId];
  }

  getSettingsOrDefault(deviceId: string): DeviceSettings {
    return this.getSettings(deviceId) ?? { deviceId, enforcementEnabled: false, rules: [] };
  }

  async putDevice(device: KnownDevice): Promise<KnownDevice> {
    this.state.devices[device.deviceId] = device;
    await this.save();
    return device;
  }

  async resetSession(deviceId: string) {
    delete this.state.sessions[deviceId];
    await this.save();
  }

  async resetSettings(deviceId: string) {
    delete this.state.settings[deviceId];
    delete this.state.sessions[deviceId];
    await this.save();
    return this.getSettingsOrDefault(deviceId);
  }

  async setSession(deviceId: string, session: EnforcementSession): Promise<void> {
    this.state.sessions[deviceId] = session;
    await this.save();
  }

  async setSettings(settings: DeviceSettings): Promise<DeviceSettings | undefined> {
    this.state.settings[settings.deviceId] = settings;
    await this.save();
    return settings;
  }
}
