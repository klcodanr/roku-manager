import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEventSeries } from "../src/lib/event-history.ts";

const event = (timestamp, enforcementStatus, usedMinutes = 0) => ({
  timestamp: new Date(timestamp),
  deviceId: "roku-1",
  active: false,
  appName: null,
  enforcementStatus,
  enforcementAction: "none",
  usedMinutes,
  lockedUntil: null,
});

test("bounds chart series and retains exact status counts", () => {
  const events = [
    event("2026-11-01T00:00:00Z", "none", 1),
    event("2026-11-01T00:01:00Z", "succeeded", 2),
    event("2026-11-01T12:00:00Z", "failed", 3),
    event("2026-11-02T00:00:00Z", "none", 4),
  ];

  const series = summarizeEventSeries(events, 2);

  assert.equal(series.length, 2);
  assert.deepEqual(
    series.reduce(
      (counts, point) => ({
        failed: counts.failed + point.statusCounts.failed,
        none: counts.none + point.statusCounts.none,
        succeeded: counts.succeeded + point.statusCounts.succeeded,
      }),
      { failed: 0, none: 0, succeeded: 0 },
    ),
    { failed: 1, none: 2, succeeded: 1 },
  );
  assert.equal(series[0].usedMinutes, 2);
  assert.equal(series[1].usedMinutes, 4);
});

test("does not alter small histories", () => {
  const events = [event("2026-11-01T00:00:00Z", "none")];
  assert.deepEqual(summarizeEventSeries(events), [
    {
      timestamp: events[0].timestamp,
      usedMinutes: 0,
      enforcementStatus: "none",
      statusCounts: { failed: 0, none: 1, succeeded: 0 },
    },
  ]);
});
