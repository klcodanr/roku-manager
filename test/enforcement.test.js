import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEnforcer } from "../src/enforcement.js";
import { EventLog } from "../src/event-log.js";
import { Store } from "../src/store.js";

function fixture({
  active = true,
  activeApp = "Netflix",
  maxMinutes = 1,
  limitBehavior = "cooldown",
  cooldownMinutes = 2,
  failPowerOff = false,
} = {}) {
  let now = new Date("2026-10-30T12:00:00");
  let device = { id: "roku-1", active: active ? { id: activeApp, name: activeApp } : null };
  let session;
  let powerOffAttempts = 0;
  const store = {
    getSettings: () => ({
      id: "roku-1",
      maxMinutes,
      blockedWindows: [],
      limitBehavior,
      cooldownMinutes,
    }),
    getSession: () => session,
    setSession: async (_id, value) => {
      session = value;
    },
  };
  const roku = {
    list: async () => [device],
    powerOff: async () => {
      powerOffAttempts += 1;
      if (failPowerOff && powerOffAttempts === 1) throw new Error("power off failed");
      device = { ...device, active: null };
    },
  };
  const enforce = createEnforcer({
    roku,
    store,
    logger: { error() {} },
    clock: () => new Date(now),
  });
  return {
    enforce,
    setTime: (value) => {
      now = new Date(value);
    },
    setActive: (value) => {
      device = { ...device, active: value ? { name: "Netflix" } : null };
    },
    getSession: () => session,
    getPowerOffAttempts: () => powerOffAttempts,
  };
}

test("accumulates usage across inactive periods and persists the lockout", async () => {
  const fixtureState = fixture();
  await fixtureState.enforce();
  fixtureState.setTime("2026-10-30T12:00:40");
  await fixtureState.enforce();
  fixtureState.setTime("2026-10-30T12:01:01");
  fixtureState.setActive(false);
  await fixtureState.enforce();
  fixtureState.setTime("2026-10-30T12:01:22");
  fixtureState.setActive(true);
  await fixtureState.enforce();
  fixtureState.setTime("2026-10-30T12:01:43");
  await fixtureState.enforce();

  assert.equal(fixtureState.getPowerOffAttempts(), 1);
  assert.equal(fixtureState.getSession().usedSeconds, 61);
  assert.equal(
    fixtureState.getSession().lockedUntil,
    new Date("2026-10-30T12:03:43").toISOString(),
  );
});

test("retries a lockout on every pass and resets after cooldown", async () => {
  const fixtureState = fixture({ active: true, maxMinutes: 0 });
  await fixtureState.enforce();
  fixtureState.setActive(true);
  fixtureState.setTime("2026-10-30T12:01:00");
  await fixtureState.enforce();
  assert.equal(fixtureState.getPowerOffAttempts(), 2);

  fixtureState.setTime("2026-10-30T12:02:01");
  await fixtureState.enforce();
  assert.equal(fixtureState.getSession().usedSeconds, 0);
});

test("persists enforcement failure and clears it after a successful retry", async () => {
  const fixtureState = fixture({ active: true, maxMinutes: 0, failPowerOff: true });

  await fixtureState.enforce();
  assert.equal(fixtureState.getSession().enforcementFailed, true);
  assert.equal(fixtureState.getPowerOffAttempts(), 1);

  fixtureState.setTime("2026-10-30T12:00:30");
  await fixtureState.enforce();
  assert.equal(fixtureState.getSession().usedSeconds, 30);
  assert.equal(fixtureState.getSession().enforcementFailed, false);
  assert.equal(fixtureState.getPowerOffAttempts(), 2);
});

test("uses the next local midnight for rest-of-day lockouts", async () => {
  const fixtureState = fixture({ active: true, maxMinutes: 0, limitBehavior: "rest_of_day" });
  fixtureState.setTime("2026-10-30T23:59:59");
  await fixtureState.enforce();

  assert.equal(fixtureState.getSession().lockedUntil, new Date(2026, 9, 31).toISOString());
});

test("resetSettings clears policy and usage state", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const store = new Store(path.join(directory, "state.json"));
  await store.load();
  await store.setSettings("roku-1", {
    id: "roku-1",
    maxMinutes: 30,
    blockedWindows: [],
    limitBehavior: "rest_of_day",
    cooldownMinutes: 15,
  });
  await store.setSession("roku-1", { date: "2026-10-30", usedSeconds: 1800, lockedUntil: null });

  const settings = await store.resetSettings("roku-1");

  assert.equal(settings.maxMinutes, null);
  assert.deepEqual(settings.blockedWindows, []);
  assert.equal(settings.limitBehavior, "rest_of_day");
  assert.equal(settings.cooldownMinutes, 15);
  assert.equal(store.getSession("roku-1"), undefined);
});

test("treats native-ui as inactive", async () => {
  const fixtureState = fixture({ activeApp: "native-ui", maxMinutes: 0 });
  await fixtureState.enforce();

  assert.equal(fixtureState.getPowerOffAttempts(), 0);
  assert.equal(fixtureState.getSession().usedSeconds, 0);
});

test("treats Roku Dynamic Menu as inactive", async () => {
  const fixtureState = fixture({ activeApp: "Roku Dynamic Menu", maxMinutes: 0 });
  await fixtureState.enforce();

  assert.equal(fixtureState.getPowerOffAttempts(), 0);
  assert.equal(fixtureState.getSession().usedSeconds, 0);
});

test("reloads saved settings", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const store = new Store(path.join(directory, "state.json"));
  await store.load();
  await store.setSettings("roku-1", {
    id: "roku-1",
    maxMinutes: 30,
    blockedWindows: [],
    limitBehavior: "cooldown",
    cooldownMinutes: 5,
  });

  assert.equal(store.getSettings("roku-1").maxMinutes, 30);
  assert.equal(store.getSettings("roku-1").limitBehavior, "cooldown");
  assert.equal(store.getSettings("roku-1").cooldownMinutes, 5);
});

test("records device state and enforcement outcome for every check", async () => {
  const fixtureState = fixture({ maxMinutes: 0 });
  const loggedEvents = [];
  const enforce = createEnforcer({
    roku: {
      list: async () => [{ id: "roku-1", active: { id: "YouTube", name: "YouTube" } }],
      powerOff: async () => {},
    },
    store: {
      getSettings: () => ({
        id: "roku-1",
        maxMinutes: 0,
        blockedWindows: [],
        limitBehavior: "cooldown",
        cooldownMinutes: 2,
      }),
      getSession: fixtureState.getSession,
      setSession: async (_id, value) => (fixtureState.session = value),
    },
    eventLog: { append: async (event) => loggedEvents.push(event) },
    clock: () => new Date("2026-10-30T12:00:00Z"),
  });

  await enforce();

  assert.equal(loggedEvents.length, 1);
  assert.deepEqual(loggedEvents[0], {
    timestamp: "2026-10-30T12:00:00.000Z",
    deviceId: "roku-1",
    active: true,
    appName: "YouTube",
    enforcementStatus: "succeeded",
    enforcementEvent: "powered_off_daily_limit",
    usedMinutes: 0,
    lockedUntil: "2026-10-30T12:02:00.000Z",
  });
});

test("writes each device to a separate event log", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const eventLog = new EventLog(directory, { maxBytes: 1024, maxFiles: 2 });

  await eventLog.append({ deviceId: "roku-1", event: "first" });
  await eventLog.append({ deviceId: "roku-2", event: "second" });
  await eventLog.close();

  const files = await fs.readdir(directory);
  assert.equal(files.length, 2);
  assert.ok(files.every((file) => file.endsWith(".jsonl")));
});

test("reads events across a device log rotation", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const eventLog = new EventLog(directory, { maxBytes: 120, maxFiles: 2 });

  await eventLog.append({
    deviceId: "roku-1",
    timestamp: "2026-10-30T12:00:00.000Z",
    event: "first",
    value: "1234567890",
  });
  await eventLog.append({
    deviceId: "roku-1",
    timestamp: "2026-10-30T12:01:00.000Z",
    event: "second",
    value: "1234567890",
  });
  await eventLog.append({
    deviceId: "roku-2",
    timestamp: "2026-10-30T12:02:00.000Z",
    event: "other",
  });
  await eventLog.close();

  const events = await eventLog.read("roku-1");
  assert.deepEqual(
    events.map((event) => event.event),
    ["first", "second"],
  );
});

test("caches full history and invalidates it after append", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const eventLog = new EventLog(directory);

  await eventLog.append({
    deviceId: "roku-1",
    timestamp: "2026-10-30T12:00:00.000Z",
    event: "first",
  });
  assert.equal((await eventLog.readAll("roku-1")).length, 1);
  assert.equal((await eventLog.read("roku-1", 1))[0].event, "first");

  await eventLog.append({
    deviceId: "roku-1",
    timestamp: "2026-10-30T12:01:00.000Z",
    event: "second",
  });
  assert.deepEqual(
    (await eventLog.readAll("roku-1")).map((event) => event.event),
    ["first", "second"],
  );
  assert.deepEqual(
    (await eventLog.read("roku-1", 1)).map((event) => event.event),
    ["second"],
  );

  await eventLog.close();
});
