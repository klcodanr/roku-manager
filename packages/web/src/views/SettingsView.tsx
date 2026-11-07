import { SettingsForm } from "../components/SettingsForm";
import { RouteError, RouteLoading } from "../components/RouteStatus";
import { useDeviceDetails } from "../hooks/useDeviceDetails";
import { useManageDevice } from "../hooks/useManageDevice";

export function SettingsView({ deviceId }: { deviceId: string }) {
  const { device } = useManageDevice(deviceId);
  const { details, loading, error, reload } = useDeviceDetails(device?.deviceId ?? null, false);

  if (!device) return null;
  if (error) return <RouteError message={error} onRetry={reload} />;
  if (loading || !details) return <RouteLoading />;

  return <SettingsForm device={device} initialSettings={details.settings} />;
}
