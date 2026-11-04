import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventLog } from "../src/lib/event-log.ts";

const deviceId = "S1GH35AFXYJT";

const event = (index) => ({
  timestamp: new Date(Date.UTC(2026, 10, 3, 0, 0, index % 60)),
  deviceId,
  active: false,
  appName: null,
  enforcementStatus: "none",
  enforcementAction: "none",
  usedMinutes: 0,
  lockedUntil: null,
});

test("reads a large event history without overflowing the call stack", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-events-"));
  const fileName = `${Buffer.from(deviceId).toString("base64url")}-2026-11-03.log`;
  const count = 200_000;
  await fs.writeFile(
    path.join(directory, fileName),
    `${Array.from({ length: count }, (_, index) => JSON.stringify(event(index))).join("\n")}\n`,
  );

  const events = await new EventLog(directory).readEvents({ deviceId, dayLimit: 7 });

  assert.equal(events.length, count);
});

test("returns no events when the event directory does not exist", async () => {
  const directory = path.join(os.tmpdir(), `roku-manager-events-${Date.now()}`);

  assert.deepEqual(await new EventLog(directory).readEvents({ deviceId, dayLimit: 7 }), []);
});
