import { Link } from "./Link";
import { deviceName, isAvailable } from "../utils";
import type { RokuDevice } from "@roku-manager/core";

export function DeviceCard({ device }: { device: RokuDevice }) {
  if (!isAvailable(device))
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-lg shadow-slate-900/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-extrabold uppercase tracking-[.13em] text-slate-500">
              {device.info?.modelName ?? "Roku device"}
            </p>
            <h2 className="text-xl font-bold">{deviceName(device)}</h2>
          </div>
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
            Offline
          </span>
        </div>
        <p className="my-2.5 text-red-700">{device.error}</p>
        {device.lastSeenAt && (
          <p className="text-sm text-slate-500">
            Last seen {new Date(device.lastSeenAt).toLocaleString()}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/manage/${encodeURIComponent(device.deviceId)}`}>Manage device</Link>
        </div>
      </section>
    );
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[.13em] text-blue-700">
            {device.info.modelName}
          </p>
          <h2 className="text-xl font-bold tracking-tight">{deviceName(device)}</h2>
        </div>
        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
          {device.online ? (device.active ? "Active" : "Idle") : "Offline"}
        </span>
      </div>
      <p className="my-2.5">
        {device.active ? (
          <>
            Currently active: <strong>{device.active.name}</strong>
          </>
        ) : (
          "No active app reported"
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/manage/${encodeURIComponent(device.deviceId)}`}>Manage device</Link>
      </div>
    </section>
  );
}
