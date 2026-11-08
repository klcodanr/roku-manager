import { useCallback } from "preact/hooks";
import { useQuery, useQueryClient } from "@tanstack/preact-query";
import { getDevices } from "../api";

export function useDevices() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["devices"],
    queryFn: () => getDevices(),
  });

  const reload = useCallback(() => {
    queryClient.resetQueries();
    queryClient.query({ queryKey: ["devices"], queryFn: () => getDevices(true) }).then(console.log);
  }, [queryClient]);

  return {
    devices: query.data?.devices ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
    reload,
  };
}
