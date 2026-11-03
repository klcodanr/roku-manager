import { useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/preact-query";
import { addDevice } from "../api";
import { DeviceCard } from "../components/DeviceCard";
import type { RokuDevice } from "@roku-manager/core";

export function DevicesView({
  devices,
  onRefresh,
}: {
  devices: RokuDevice[];
  onRefresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const addDeviceMutation = useMutation({
    mutationFn: addDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const ip = new FormData(form).get("ip")?.toString().trim() || "";
    setMessage("Adding...");
    try {
      await addDeviceMutation.mutateAsync(ip);
      form.reset();
      setMessage("");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <>
      <div className="mb-6">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-[.13em] text-blue-700">
          Overview
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">Devices</h1>
      </div>
      {devices.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard key={device.deviceId} device={device} />
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
          No Roku devices found. Confirm network access is enabled on the Roku and that the
          container can access the LAN.
        </section>
      )}
      <form
        onSubmit={submit}
        className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5"
      >
        <h2 className="mb-4 text-xl font-bold">Add a device by IP</h2>
        <label className="block max-w-sm font-semibold">
          Roku IP address
          <input
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-blue-200 focus:border-blue-700"
            name="ip"
            type="text"
            placeholder="192.168.1.17"
            required
          />
        </label>
        <div className="mt-5 flex items-center gap-4">
          <button
            className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white hover:bg-blue-800"
            type="submit"
          >
            Add device
          </button>
          <span className="font-bold text-green-700">{message}</span>
        </div>
      </form>
    </>
  );
}
