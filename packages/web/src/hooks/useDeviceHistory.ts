import { useQuery } from "@tanstack/preact-query";
import { getEvents } from "../api";

export function useDeviceHistory(id: string, dayLimit: number) {
  const query = useQuery({
    queryKey: ["deviceHistory", id, dayLimit],
    queryFn: () => getEvents(id, dayLimit),
  });

  return {
    history: query.data ?? null,
    loading: query.isPending,
    error: query.error?.message ?? null,
  };
}
