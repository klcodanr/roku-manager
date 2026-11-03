import type { RokuDevice } from "@roku-manager/core";
import { Link } from "./Link";
import { deviceName } from "../utils";

export function DeviceHeader({
  device,
  active,
}: {
  device: RokuDevice;
  active: "session" | "settings" | "history" | "diagnostics";
}) {
  const activeClass = "flex-1 text-center font-bold text-blue-700";
  const inactiveClass = "flex-1 text-center font-semibold text-slate-500 hover:text-blue-700";

  return (
    <div className="mb-6">
      <Link href="/" className="mb-4 inline-block font-bold text-blue-700 hover:text-blue-900">
        ← Devices
      </Link>
      <p className="mb-1 text-xs font-extrabold uppercase tracking-[.13em] text-blue-700">Manage</p>
      <h1 className="text-4xl font-extrabold tracking-tight">{deviceName(device)}</h1>
      <p className="text-slate-500">{device.ip}</p>
      {"error" in device && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Device offline: {device.error}
        </p>
      )}
      <nav className="mt-4 flex gap-4 border-b border-slate-200 pb-3">
        <Link
          href={`/manage/${encodeURIComponent(device.deviceId)}`}
          className={active === "session" ? activeClass : inactiveClass}
        >
          Current session
        </Link>
        <Link
          href={`/manage/${encodeURIComponent(device.deviceId)}/diagnostics`}
          className={active === "diagnostics" ? activeClass : inactiveClass}
        >
          Diagnostics
        </Link>
        <Link
          href={`/manage/${encodeURIComponent(device.deviceId)}/settings`}
          className={active === "settings" ? activeClass : inactiveClass}
        >
          Settings
        </Link>
        <Link
          href={`/manage/${encodeURIComponent(device.deviceId)}/history`}
          className={active === "history" ? activeClass : inactiveClass}
        >
          History
        </Link>
      </nav>
    </div>
  );
}
