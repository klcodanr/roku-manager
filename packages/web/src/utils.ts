import type { AvailableRokuDevice, RokuDevice } from "@roku-manager/core";

export function deviceName(device: RokuDevice) {
  if ("error" in device) {
    const name = device.info?.friendlyDeviceName || device.info?.deviceId || device.deviceId;
    return device.info?.userDeviceLocation ? `${name} (${device.info.userDeviceLocation})` : name;
  }
  const name = device.info.friendlyDeviceName || device.info.deviceId || device.deviceId;
  return device.info.userDeviceLocation ? `${name} (${device.info.userDeviceLocation})` : name;
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function isAvailable(device: RokuDevice): device is AvailableRokuDevice {
  return !("error" in device);
}
