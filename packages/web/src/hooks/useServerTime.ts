import { useQuery } from "@tanstack/preact-query";

async function fetchServerTime() {
  const response = await fetch("/api/server-time", { credentials: "same-origin" });
  const value = (await response.json()) as { now: string; timeZone: string };
  return `Server time: ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium", timeZone: value.timeZone }).format(new Date(value.now))} (${value.timeZone})`;
}

export function useServerTime() {
  const query = useQuery({
    queryKey: ["serverTime"],
    queryFn: fetchServerTime,
    refetchInterval: 15000,
  });

  return query.data ?? "Server time unavailable";
}
