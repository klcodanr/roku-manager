import { useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/preact-query";
import { resetSession, runEnforcement } from "../api";
import { SessionSummary } from "../components/SessionSummary";
import type { AvailableRokuDevice } from "@roku-manager/core";
import type { SessionResponse } from "../api";

export function SessionView({
  device,
  initialSession,
  onReload,
}: {
  device: AvailableRokuDevice;
  initialSession: SessionResponse;
  onReload: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const sessionMutation = useMutation({
    mutationFn: resetSession,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deviceSession", device.deviceId] }),
  });
  const enforcementMutation = useMutation({
    mutationFn: runEnforcement,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deviceSession", device.deviceId] }),
  });

  async function enforce() {
    setMessage("Running enforcement...");
    try {
      await enforcementMutation.mutateAsync();
      onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function reset() {
    if (!window.confirm("Reset this session's usage and lockout state?")) return;
    setMessage("Resetting session...");
    try {
      setSession(await sessionMutation.mutateAsync(device.deviceId));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <SessionSummary response={session} onEnforce={enforce} onReset={reset} message={message} />
  );
}
