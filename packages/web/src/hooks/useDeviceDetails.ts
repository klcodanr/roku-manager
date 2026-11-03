import { useQuery } from "@tanstack/preact-query";
import { getSession, getSettings } from "../api";
import type { SessionResponse } from "../api";
import type { DeviceSettings } from "@roku-manager/core";

export type DeviceDetails = {
  settings: DeviceSettings;
  session?: SessionResponse;
};

export function useDeviceDetails(id: string | null, includeSession = true) {
  const settingsQuery = useQuery({
    queryKey: ["deviceSettings", id],
    enabled: Boolean(id),
    queryFn: () => {
      if (!id) throw new Error("A device is required");
      return getSettings(id);
    },
  });
  const sessionQuery = useQuery({
    queryKey: ["deviceSession", id],
    enabled: Boolean(id) && includeSession,
    queryFn: () => {
      if (!id) throw new Error("A device is required");
      return getSession(id);
    },
  });

  return {
    details: settingsQuery.data
      ? { settings: settingsQuery.data, session: includeSession ? sessionQuery.data : undefined }
      : null,
    loading: settingsQuery.isPending || (includeSession && sessionQuery.isPending),
    error: settingsQuery.error?.message ?? (includeSession ? sessionQuery.error?.message : null),
    reload: async () => {
      await settingsQuery.refetch();
      if (includeSession) await sessionQuery.refetch();
    },
  };
}
