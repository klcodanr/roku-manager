import { useDevices } from "./useDevices";

export function useManageDevice(deviceId: string) {
  const { devices } = useDevices();
  const device = devices.find((item) => item.deviceId === deviceId);

  return { device };
}
