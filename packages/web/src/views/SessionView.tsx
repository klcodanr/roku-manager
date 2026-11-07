import { useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/preact-query";
import { resetSession, runEnforcement } from "../api";
import { SessionSummary } from "../components/SessionSummary";
import { useDeviceDetails } from "../hooks/useDeviceDetails";
import { useManageDevice } from "../hooks/useManageDevice";
import { isAvailable } from "../utils";
import { RouteError, RouteLoading } from "../components/RouteStatus";

export function SessionView({ deviceId }: { deviceId: string }) {
  const { device, reloadDevices } = useManageDevice(deviceId);
  const availableDevice = device && isAvailable(device) ? device : null;
  const { details, loading, error, reload } = useDeviceDetails(
    availableDevice?.deviceId ?? null,
    Boolean(availableDevice),
  );
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const sessionMutation = useMutation({
    mutationFn: resetSession,
    onSuccess: () =>
      availableDevice &&
      queryClient.invalidateQueries({ queryKey: ["deviceSession", availableDevice.deviceId] }),
  });
  const enforcementMutation = useMutation({
    mutationFn: runEnforcement,
    onSuccess: () =>
      availableDevice &&
      queryClient.invalidateQueries({ queryKey: ["deviceSession", availableDevice.deviceId] }),
  });

  if (!device) return null;
  if (!availableDevice) {
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Device is unavailable</h1>
        <p className="mt-2">{"error" in device ? device.error : "The device is unavailable."}</p>
      </section>
    );
  }
  if (error) return <RouteError message={error} onRetry={reload} />;
  if (loading || !details?.session) return <RouteLoading message="Loading session..." />;
  const availableDeviceId = availableDevice.deviceId;

  async function enforce() {
    setMessage("Running enforcement...");
    try {
      await enforcementMutation.mutateAsync();
      reload();
      reloadDevices(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function reset() {
    if (!window.confirm("Reset this session's usage and lockout state?")) return;
    setMessage("Resetting session...");
    try {
      await sessionMutation.mutateAsync(availableDeviceId);
      setMessage("");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <SessionSummary
      response={details.session}
      onEnforce={enforce}
      onReset={reset}
      message={message}
    />
  );
}
