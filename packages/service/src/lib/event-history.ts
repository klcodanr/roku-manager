import type { EnforcementEvent } from "@roku-manager/core";

const statusNames = ["failed", "none", "succeeded"] as const;
type Status = (typeof statusNames)[number];

export type HistorySeriesPoint = {
  timestamp: Date;
  usedMinutes: number;
  enforcementStatus: Status;
  statusCounts: Record<Status, number>;
};

/**
 * Return a bounded representation for charts while retaining exact status
 * counts for each time bucket. The last observation in a bucket represents
 * its usage value, since usedMinutes is a point-in-time reading.
 */
export const summarizeEventSeries = (
  events: EnforcementEvent[],
  maxPoints = 500,
): HistorySeriesPoint[] => {
  if (!events.length) return [];

  const firstTimestamp = events[0].timestamp.getTime();
  const lastTimestamp = events.at(-1)!.timestamp.getTime();
  const timeRange = lastTimestamp - firstTimestamp;
  const buckets = new Map<number, HistorySeriesPoint>();

  for (const event of events) {
    const bucket = timeRange
      ? Math.min(
          maxPoints - 1,
          Math.floor(((event.timestamp.getTime() - firstTimestamp) / timeRange) * maxPoints),
        )
      : 0;
    const current = buckets.get(bucket);
    if (current) {
      current.timestamp = event.timestamp;
      current.usedMinutes = event.usedMinutes;
      current.enforcementStatus = event.enforcementStatus;
      current.statusCounts[event.enforcementStatus] += 1;
      continue;
    }

    buckets.set(bucket, {
      timestamp: event.timestamp,
      usedMinutes: event.usedMinutes,
      enforcementStatus: event.enforcementStatus,
      statusCounts: {
        failed: event.enforcementStatus === "failed" ? 1 : 0,
        none: event.enforcementStatus === "none" ? 1 : 0,
        succeeded: event.enforcementStatus === "succeeded" ? 1 : 0,
      },
    });
  }

  return [...buckets.values()];
};
