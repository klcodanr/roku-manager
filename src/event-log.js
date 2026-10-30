import fs from "node:fs/promises";
import { createStream } from "rotating-file-stream";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;

/**
 * Stores newline-delimited JSON events in one rotating stream per device.
 * maxFiles applies to rotated files; the active file is retained as well.
 */
export class EventLog {
  /**
   * @param {string} directory
   * @param {{ maxBytes?: number, maxFiles?: number }} options
   */
  constructor(directory, { maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES } = {}) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.maxFiles = maxFiles;
    this.streams = new Map();
    this.cache = new Map();
  }

  /** @param {Record<string, unknown> & { deviceId: string }} event @returns {Promise<void>} */
  async append(event) {
    await fs.mkdir(this.directory, { recursive: true });
    const stream = this.getStream(event.deviceId);
    const line = `${JSON.stringify(event)}\n`;
    await new Promise((resolve, reject) => {
      stream.write(line, (error) => (error ? reject(error) : resolve()));
    });
    this.cache.delete(event.deviceId);
  }

  /** @returns {Promise<void>} */
  async close() {
    await Promise.all(
      [...this.streams.values()].map(
        (stream) =>
          new Promise((resolve) => {
            stream.end(resolve);
          }),
      ),
    );
    this.streams.clear();
  }

  /**
   * @param {string} deviceId
   * @param {number} [limit]
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async read(deviceId, limit = 500) {
    const events = await this.readAll(deviceId);
    return events.slice(-limit);
  }

  /**
   * Read and cache the complete retained history for a device.
   * @param {string} deviceId
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async readAll(deviceId) {
    if (this.cache.has(deviceId)) return this.cache.get(deviceId);

    let files;
    try {
      files = await fs.readdir(this.directory);
    } catch (error) {
      if (error.code === "ENOENT") {
        this.cache.set(deviceId, []);
        return [];
      }
      throw error;
    }

    const events = [];
    for (const file of files.filter((name) => name.endsWith(".jsonl"))) {
      const content = await fs.readFile(`${this.directory}/${file}`, "utf8");
      for (const line of content.split("\n")) {
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (event.deviceId === deviceId) events.push(event);
        } catch {
          // Ignore an incomplete line left by an interrupted write.
        }
      }
    }

    const result = events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    this.cache.set(deviceId, result);
    return result;
  }

  getStream(deviceId) {
    if (!this.streams.has(deviceId)) {
      this.streams.set(
        deviceId,
        createStream(`${safeDeviceId(deviceId)}.jsonl`, {
          path: this.directory,
          size: `${this.maxBytes}B`,
          maxFiles: this.maxFiles,
        }),
      );
    }
    return this.streams.get(deviceId);
  }
}

function safeDeviceId(deviceId) {
  return Buffer.from(String(deviceId)).toString("base64url");
}

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_FILES, safeDeviceId };
