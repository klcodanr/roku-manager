import type {
  CheckResult,
  DeviceSettings,
  EventsSummary,
  EnforcementSession,
  RokuApp,
  RokuDevice,
} from "@roku-manager/core";

type DeviceResponse = { devices: RokuDevice[] };
export type SessionResponse = { session: EnforcementSession; status: CheckResult };
export type RemoteCommand =
  | "home"
  | "back"
  | "up"
  | "down"
  | "left"
  | "right"
  | "select"
  | "play"
  | "volumeDown"
  | "volumeUp"
  | "volumeMute"
  | "powerOn"
  | "powerOff"
  | "reverse"
  | "forward"
  | "options"
  | "inputTuner"
  | "inputHdmi1"
  | "inputHdmi2"
  | "inputHdmi3"
  | "inputHdmi4";

function errorMessage(body: unknown, status: number) {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const error = body as { error?: unknown; detail?: unknown; message?: unknown };
    for (const value of [error.error, error.detail, error.message]) {
      if (typeof value === "string") return value;
    }
  }
  return `Request failed (${status})`;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(errorMessage(body, response.status));
  }
  if (response.status === 204 || response.status === 202) return undefined as T;
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export const getDevices = (refresh = false) =>
  request<DeviceResponse>(`/api/devices?refresh=${refresh}`);

export const getSettings = (id: string) =>
  request<DeviceSettings>(`/api/devices/${encodeURIComponent(id)}/settings`);

export const getSession = (id: string) =>
  request<SessionResponse>(`/api/devices/${encodeURIComponent(id)}/session`);

export const getEvents = (id: string, dayLimit = 7) =>
  request<EventsSummary>(
    `/api/devices/${encodeURIComponent(id)}/events?dayLimit=${encodeURIComponent(dayLimit)}`,
  );

export const sendRemoteCommand = (deviceId: string, command: RemoteCommand) =>
  request<void>(`/api/devices/${encodeURIComponent(deviceId)}/remote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command }),
  });

export const getApps = (deviceId: string) =>
  request<{ apps: RokuApp[] }>(`/api/devices/${encodeURIComponent(deviceId)}/apps`);

export const launchApp = (deviceId: string, appId: string) =>
  request<void>(
    `/api/devices/${encodeURIComponent(deviceId)}/apps/${encodeURIComponent(appId)}/launch`,
    { method: "POST" },
  );

export async function addDevice(ip: string) {
  return request<RokuDevice>("/api/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ip }),
  });
}

export const updateSettings = (settings: DeviceSettings) =>
  request<DeviceSettings>(`/api/devices/${encodeURIComponent(settings.deviceId)}/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });

export const resetSettings = (id: string) =>
  request<DeviceSettings>(`/api/devices/${encodeURIComponent(id)}/settings`, { method: "DELETE" });

export const resetSession = (id: string) =>
  request<SessionResponse>(`/api/devices/${encodeURIComponent(id)}/session`, { method: "DELETE" });

export const runEnforcement = () => request<void>("/api/enforce", { method: "POST" });
