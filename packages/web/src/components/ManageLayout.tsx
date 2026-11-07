import type { ComponentChildren } from "preact";
import { DeviceHeader } from "./DeviceHeader";
import { Link } from "./Link";
import { useManageDevice } from "../hooks/useManageDevice";

export function ManageLayout({
  active,
  deviceId,
  children,
}: {
  active: "session" | "settings" | "history" | "diagnostics";
  deviceId: string;
  children?: ComponentChildren;
}) {
  const { device } = useManageDevice(deviceId);
  if (!device)
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Device not found</h1>
        <Link href="/">Back to devices</Link>
      </section>
    );
  return (
    <>
      <DeviceHeader device={device} active={active} />
      {children}
    </>
  );
}
