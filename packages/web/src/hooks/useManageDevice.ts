import { useDevices } from "./useDevices";

export function useManageDevice(deviceId: string) {
  const { devices, reload } = useDevices();
  const device = devices.find((item) => item.deviceId === deviceId);

  return { device, reloadDevices: reload };
}
