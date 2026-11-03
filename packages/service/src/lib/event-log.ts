import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { LRUCache } from "lru-cache";
import rootLogger from "../logger";
import { enforcementEventSchema, type EnforcementEvent } from "@roku-manager/core";

const logger = rootLogger.child({ module: "event-log" });

const safeDeviceId = (deviceId: string) => {
  return Buffer.from(deviceId).toString("base64url");
};

const isInDayRange = (name: string, dayLimit: number): boolean => {
  const match = name.match(/-(\d{4})-(\d{2})-(\d{2})\.log$/);
  if (!match) return false;
  const [_, year, month, day] = match;
  const fileDate = new Date(Number(year), Number(month) - 1, Number(day));
  const now = new Date();
  const endDate = new Date(now);
  endDate.setTime(now.getTime() - dayLimit * 24 * 60 * 60 * 1000);
  return fileDate <= now && fileDate >= endDate;
};

/**
 * Stores newline-delimited JSON events in one file per device per day.
 */
export class EventLog {
  private readonly directory: string;
  private readonly writes: Map<string, Promise<void>>;
  private readonly cache: LRUCache<string, Array<EnforcementEvent>>;

  constructor(directory: string) {
    this.directory = directory;
    this.writes = new Map();
    this.cache = new LRUCache({
      max: 100,
      fetchMethod: async (key) => this.readEventFile(key),
    });
  }

  private async readEventFile(name: string): Promise<Array<EnforcementEvent>> {
    const events: Array<EnforcementEvent> = [];
    try {
      const content = await readFile(`${this.directory}/${name}`, "utf8");
      for (const line of content.split("\n")) {
        if (!line) {
          continue;
        }
        try {
          const event = enforcementEventSchema.parse(JSON.parse(line));
          events.push(event);
        } catch {
          // Ignore an incomplete line left by an interrupted write.
        }
      }
    } catch (err) {
      logger.warn(err, "Failed to read event file");
    }
    return events;
  }

  append(event: EnforcementEvent) {
    const deviceId = safeDeviceId(event.deviceId);
    const date = new Date().toISOString().slice(0, 10);
    const name = `${deviceId}-${date}.log`;
    const filePath = `${this.directory}/${name}`;
    const previous = this.writes.get(deviceId) ?? Promise.resolve();
    const write = previous
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        await appendFile(filePath, `${JSON.stringify(enforcementEventSchema.encode(event))}\n`);
        this.cache.delete(name);
      })
      .catch((err) => logger.error({ err }, "Failed to write event file"));
    this.writes.set(deviceId, write);
    return write;
  }

  async close() {
    await Promise.all(this.writes.values());
    this.writes.clear();
  }

  async readEvents({ deviceId, dayLimit = 30 }: { deviceId: string; dayLimit: number }) {
    const files = await readdir(this.directory);

    const events: EnforcementEvent[] = [];
    const deviceFiles = await Promise.all(
      files
        .filter(
          (file) => file.startsWith(`${safeDeviceId(deviceId)}-`) && isInDayRange(file, dayLimit),
        )
        .map((file) => this.cache.fetch(file)),
    );
    events.push(...deviceFiles.flat().filter((e) => e !== undefined));
    return events;
  }
}
