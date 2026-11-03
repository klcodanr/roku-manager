import { useState } from "preact/hooks";
import type { RokuDevice } from "@roku-manager/core";
import { History } from "../components/History";
import { useDeviceHistory } from "../hooks/useDeviceHistory";

export function HistoryView({ device }: { device: RokuDevice }) {
  const [dayLimit, setDayLimit] = useState(7);
  const { history, loading, error } = useDeviceHistory(device.deviceId, dayLimit);

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <label className="font-semibold text-slate-600" htmlFor="history-day-limit">
          Show history for
        </label>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-blue-200 focus:border-blue-700"
          id="history-day-limit"
          value={dayLimit}
          onChange={(event) =>
            setDayLimit(Number((event.currentTarget as HTMLSelectElement).value))
          }
        >
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>
      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          Loading history...
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-red-200 bg-white p-5">
          <h2 className="text-xl font-bold">Unable to load history</h2>
          <p>{error}</p>
        </section>
      ) : history ? (
        <History history={history} />
      ) : null}
    </>
  );
}
