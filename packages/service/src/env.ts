import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { noEntityErrorSchema } from "./error";

const root = dirname(fileURLToPath(import.meta.url));

const config = z.object({
  DISCOVERY_INTERVAL_MS: z.coerce.number().default(21_600_000),
  ENFORCEMENT_INTERVAL_MS: z.coerce.number().default(15_000),
  ENFORCEMENT_RECHECK_DELAY_MS: z.coerce.number().default(1_000),
  ENFORCEMENT_RECHECK_ATTEMPTS: z.coerce.number().default(3),
  EVENT_LOG_DIR: z.string().default(join(root, "data", "events")),
  DATA_FILE: z.string().default(join(root, "data", "state.json")),

  DISABLE_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_USER: z.string().default(process.env.AUTH_USER || "admin"),
  AUTH_PASSWORD: z.string().default(process.env.AUTH_PASSWORD || "change-me"),
});

export const loadEnv = () => {
  try {
    process.loadEnvFile(join(root, "..", ".env"));
  } catch (error) {
    if (!noEntityErrorSchema.safeParse(error).success) {
      throw error;
    }
  }
  return config.parse(process.env);
};
