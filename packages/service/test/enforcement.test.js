import test from "node:test";
import assert from "node:assert/strict";
import { Enforcer, matchingRule } from "../src/lib/enforcer.ts";
import { deviceRuleSchema } from "../../core/src/schemas.ts";

const settings = (overrides = {}) => ({
  deviceId: "roku-1",
  enforcementEnabled: true,
  rules: [
    {
      name: "Weekday evening",
      days: [1, 2, 3, 4, 5],
      start: "18:00",
      end: "21:00",
      maxMinutes: 30,
      limitBehavior: "cooldown",
      cooldownMinutes: 15,
    },
  ],
  ...overrides,
});

const session = () => ({
  date: "2026-11-02",
  usedSeconds: 0,
  lastActiveAt: null,
  lastObservedAt: new Date("2026-11-02T18:00:00.000Z"),
  lockedUntil: null,
  enforcementFailed: false,
  enforcementError: null,
});

test("matches the first matching ordered rule", () => {
  const first = settings();
  first.rules.unshift({
    name: "Earlier rule",
    days: [1, 2, 3, 4, 5],
    start: "15:00",
    end: "20:00",
    maxMinutes: 10,
    limitBehavior: "rest_of_day",
    cooldownMinutes: 15,
  });

  assert.equal(matchingRule(first, new Date("2026-11-02T19:00:00"))?.name, "Earlier rule");
  assert.equal(matchingRule(first, new Date("2026-11-02T22:00:00")), null);
});

test("matches the early portion of an overnight rule against its prior day", () => {
  const overnight = settings({
    rules: [
      {
        name: "Weekend overnight",
        days: [5],
        start: "22:00",
        end: "07:00",
        maxMinutes: 30,
        limitBehavior: "rest_of_day",
        cooldownMinutes: 15,
      },
    ],
  });

  assert.equal(matchingRule(overnight, new Date("2026-10-31T06:00:00"))?.name, "Weekend overnight");
});

test("uses Sunday as day 0 for overnight rules", () => {
  const overnight = settings({
    rules: [
      {
        name: "Saturday overnight",
        days: [6],
        start: "22:00",
        end: "07:00",
        maxMinutes: 30,
        limitBehavior: "rest_of_day",
        cooldownMinutes: 15,
      },
    ],
  });

  assert.equal(
    matchingRule(overnight, new Date("2026-11-01T06:00:00"))?.name,
    "Saturday overnight",
  );
});

test("accepts JavaScript day values from 0 through 6", () => {
  const rule = {
    name: "Every day",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "00:00",
    end: "23:59",
    maxMinutes: 30,
    limitBehavior: "rest_of_day",
  };

  assert.equal(deviceRuleSchema.safeParse(rule).success, true);
  assert.equal(deviceRuleSchema.safeParse({ ...rule, days: [7] }).success, false);
});

test("returns an inactive, non-enforcing check when enforcement is disabled", async () => {
  const store = {
    getSettingsOrDefault: () => ({ deviceId: "roku-1", enforcementEnabled: false, rules: [] }),
    getSession: () => session(),
  };
  const enforcer = new Enforcer({
    roku: {},
    store,
    eventLog: {},
    recheckDelayMs: 1,
    recheckAttempts: 1,
  });

  assert.deepEqual(
    await enforcer.checkDevice(
      {
        deviceId: "roku-1",
        ip: "http://192.0.2.1:8060/",
        info: {
          deviceId: "roku-1",
          friendlyDeviceName: "Test Roku",
          modelName: "Test",
          userDeviceLocation: "",
        },
        canPowerOff: true,
        canControlVolume: false,
        canSelectInput: false,
        active: { id: "native-ui", name: "Home", type: "appl" },
        online: true,
      },
      new Date("2026-11-02T19:00:00"),
    ),
    {
      active: false,
      inCooloff: false,
      limitReached: false,
      shouldUnlock: false,
      expectedAction: "none",
      expectedLockUntilDate: null,
    },
  );
});
