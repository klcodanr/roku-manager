import { createEnforcer, startEnforcement } from "./enforcement.js";
import { Store } from "./store.js";
import { RokuService } from "./roku.js";
import rootLogger from "./logger.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.js";
import { EventLog } from "./event-log.js";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, "..", ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const logger = rootLogger.child({ module: "app" });

logger.info("Starting Roku Manager");
const store = new Store(process.env.DATA_FILE || path.join(root, "..", "data", "state.json"));
const eventLog = new EventLog(
  process.env.EVENT_LOG_DIR || path.join(root, "..", "data", "events"),
  {
    maxBytes: Number(process.env.EVENT_LOG_MAX_BYTES || 10 * 1024 * 1024),
    maxFiles: Number(process.env.EVENT_LOG_MAX_FILES || 3),
  },
);

await store.load();
const roku = new RokuService({ store });
const enforce = createEnforcer({ roku, store, eventLog });
const stopDiscovery = roku.startDiscovery(Number(process.env.DISCOVERY_INTERVAL_MS || 21_600_000));
const stopEnforcement = startEnforcement(enforce, {
  intervalMs: Number(process.env.CHECK_INTERVAL_MS || 15_000),
  logger,
});

startServer({ roku, store, enforce, eventLog });

const shutdown = async () => {
  stopEnforcement();
  stopDiscovery();
  await eventLog.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
