import { loadEnv } from "./env.js";
import { Enforcer } from "./lib/enforcer.js";
import { EventLog } from "./lib/event-log.js";
import { RokuService } from "./lib/roku.js";
import { Store } from "./lib/store.js";
import rootLogger from "./logger";
import { startServer } from "./server";

const env = loadEnv();

const logger = rootLogger.child({ module: "app" });

logger.info("Starting Roku Manager");
const eventLog = new EventLog(env.EVENT_LOG_DIR);
const store = new Store(env.DATA_FILE);
await store.load();

const roku = new RokuService({ store });
const enforcer = new Enforcer({
  roku,
  store,
  eventLog,
  recheckDelayMs: env.ENFORCEMENT_RECHECK_DELAY_MS,
  recheckAttempts: env.ENFORCEMENT_RECHECK_ATTEMPTS,
});
const stopDiscovery = roku.startBackgroundDiscovery(env.DISCOVERY_INTERVAL_MS);
const stopEnforcement = enforcer.startBackgroundEnforcement(env.ENFORCEMENT_INTERVAL_MS);

startServer({ roku, store, enforcer, eventLog });

const shutdown = async () => {
  stopEnforcement();
  stopDiscovery();
  await eventLog.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
