import type { SessionResponse } from "../api";
import { formatDuration, formatTime } from "../utils";

export function SessionSummary({
  response,
  onEnforce,
  onReset,
  message,
}: {
  response: SessionResponse;
  onEnforce: () => void;
  onReset: () => void;
  message: string;
}) {
  const { session, status } = response;
  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <h2 className="text-xl font-bold">Current session</h2>
      <div className="mt-4">
        {[
          ["Date", session.date],
          ["Used duration", formatDuration(session.usedSeconds)],
          ["Active", status.active ? "Yes" : "No"],
          ["Limit reached", status.limitReached ? "Yes" : "No"],
          ["Locked until", session.lockedUntil ? formatTime(session.lockedUntil) : "Not locked"],
        ].map(([label, value]) => (
          <div className="flex justify-between gap-5 border-t border-slate-200 py-2.5" key={label}>
            <span className="font-semibold text-slate-500">{label}</span>
            <span>{value}</span>
          </div>
        ))}
        {session.enforcementError && <p className="text-red-700">{session.enforcementError}</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white hover:bg-blue-800"
          onClick={onEnforce}
        >
          Run enforcement
        </button>
        <button
          className="rounded-lg bg-slate-200 px-3.5 py-2.5 font-bold text-slate-700 hover:bg-slate-300"
          onClick={onReset}
        >
          Reset session
        </button>
        <span className="font-bold text-green-700">{message}</span>
      </div>
    </section>
  );
}
