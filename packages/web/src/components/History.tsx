import type { EventsSummary } from "@roku-manager/core";
import { HistoryCharts } from "./HistoryCharts";
import { formatTime } from "../utils";

export function History({ history }: { history: EventsSummary }) {
  if (!history.total)
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
        <h2 className="text-xl font-bold">Device history</h2>
        <p className="text-slate-500">History will appear after the next enforcement check.</p>
      </section>
    );
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold">Device history</h2>
        <span className="text-sm text-slate-500">
          Last checked {formatTime(history.series.at(-1)?.timestamp || new Date())}
        </span>
      </div>
      <HistoryCharts history={history} />
      <p className="mt-5 text-sm text-slate-500">
        Last {history.recent.length} state changes (up to 10)
      </p>
      <div className="mt-2 border-t border-slate-200">
        {history.recent
          .slice()
          .reverse()
          .map((event) => (
            <div
              className="grid grid-cols-[90px_1fr_auto] gap-3 border-b border-slate-100 py-2 text-sm"
              key={event.timestamp.toString()}
            >
              <span className="text-slate-500">{formatTime(event.timestamp)}</span>
              <span>{event.active ? `Active · ${event.appName || "Unknown app"}` : "Idle"}</span>
              <span
                className={
                  event.enforcementStatus === "failed" ? "font-bold text-red-700" : "text-slate-500"
                }
              >
                {event.usedMinutes}m
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
