import { useMutation, useQuery, useQueryClient } from "@tanstack/preact-query";
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FastForward,
  Home,
  Info,
  Play,
  Power,
  PowerOff,
  Rewind,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-preact";
import type { RokuDevice } from "@roku-manager/core";
import { getApps, launchApp, sendRemoteCommand, type RemoteCommand } from "../api";
import { deviceName, isAvailable } from "../utils";

const commands = {
  home: "Home",
  back: "Back",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  select: "OK",
  play: "Play / Pause",
  volumeDown: "Volume down",
  volumeUp: "Volume up",
  volumeMute: "Mute",
  powerOn: "Power on",
  powerOff: "Power off",
  reverse: "Reverse",
  forward: "Fast forward",
  options: "Options",
  inputTuner: "TV",
  inputHdmi1: "HDMI 1",
  inputHdmi2: "HDMI 2",
  inputHdmi3: "HDMI 3",
  inputHdmi4: "HDMI 4",
} satisfies Record<RemoteCommand, string>;

export function RemoteView({ devices }: { devices: RokuDevice[] }) {
  const [selectedId, setSelectedId] = useState(devices[0]?.deviceId ?? "");
  const selected = devices.find((device) => device.deviceId === selectedId) ?? devices[0];
  const selectedAvailable = selected && isAvailable(selected) ? selected : null;
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState("");
  const appsQuery = useQuery({
    queryKey: ["apps", selectedAvailable?.deviceId],
    queryFn: () => getApps(selectedAvailable!.deviceId),
    enabled: Boolean(selectedAvailable),
  });
  const mutation = useMutation({
    mutationFn: ({ deviceId, command }: { deviceId: string; command: RemoteCommand }) =>
      sendRemoteCommand(deviceId, command),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  const launchMutation = useMutation({
    mutationFn: (id: string) => launchApp(selectedAvailable?.deviceId ?? "", id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  function send(command: RemoteCommand) {
    if (selectedAvailable) {
      mutation.mutate({ deviceId: selectedAvailable.deviceId, command });
    }
  }

  if (!devices.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
        Add a Roku device before using the remote.
      </section>
    );
  }

  const remoteDisabled = !selectedAvailable || mutation.isPending || launchMutation.isPending;
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div className="mb-6">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-[.13em] text-blue-700">
          Control
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">Remote</h1>
      </div>
      <label className="block font-semibold">
        Device
        <select
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-blue-200 focus:border-blue-700"
          value={selected?.deviceId ?? ""}
          onChange={(event) => setSelectedId((event.currentTarget as HTMLSelectElement).value)}
        >
          {devices.map((device) => (
            <option value={device.deviceId} key={device.deviceId}>
              {deviceName(device)}
            </option>
          ))}
        </select>
      </label>
      {!selectedAvailable && (
        <p className="mt-3 text-sm text-red-700">This device is currently unavailable.</p>
      )}
      {selectedAvailable && (
        <p className="mt-3 text-sm text-slate-500">
          Currently active: <strong>{selectedAvailable.active?.name ?? "Home screen"}</strong>
        </p>
      )}
      {mutation.error && <p className="mt-3 text-sm text-red-700">{mutation.error.message}</p>}
      {mutation.isSuccess && <p className="mt-3 text-sm text-green-700">Command sent.</p>}
      <div className="mx-auto mt-7 max-w-xs">
        {selectedAvailable?.canPowerOff && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            <RemoteButton
              disabled={remoteDisabled}
              label={commands.powerOn}
              icon={<Power size={18} />}
              onClick={() => send("powerOn")}
            />
            <RemoteButton
              disabled={remoteDisabled}
              label={commands.powerOff}
              icon={<PowerOff size={18} />}
              onClick={() => send("powerOff")}
            />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.home}
            ariaLabel="Home"
            icon={<Home size={18} />}
            onClick={() => send("home")}
          />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.options}
            ariaLabel={commands.options}
            icon={<Info size={18} />}
            onClick={() => send("options")}
          />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.back}
            ariaLabel="Back"
            icon={<Undo2 size={18} />}
            onClick={() => send("back")}
          />
          <span />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.up}
            ariaLabel={commands.up}
            icon={<ArrowUp size={18} />}
            onClick={() => send("up")}
          />
          <span />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.left}
            ariaLabel={commands.left}
            icon={<ArrowLeft size={18} />}
            onClick={() => send("left")}
          />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.select}
            ariaLabel={commands.select}
            onClick={() => send("select")}
          />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.right}
            ariaLabel={commands.right}
            icon={<ArrowRight size={18} />}
            onClick={() => send("right")}
          />
          <span />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.down}
            ariaLabel={commands.down}
            icon={<ArrowDown size={18} />}
            onClick={() => send("down")}
          />
          <span />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.reverse}
            ariaLabel={commands.reverse}
            icon={<Rewind size={18} />}
            onClick={() => send("reverse")}
          />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.play}
            ariaLabel={commands.play}
            icon={<Play size={18} />}
            onClick={() => send("play")}
          />
          <RemoteButton
            disabled={remoteDisabled}
            label={commands.forward}
            ariaLabel={commands.forward}
            icon={<FastForward size={18} />}
            onClick={() => send("forward")}
          />
        </div>
        {selectedAvailable?.canControlVolume && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <RemoteButton
              disabled={remoteDisabled}
              label={commands.volumeMute}
              icon={<VolumeX size={18} />}
              onClick={() => send("volumeMute")}
            />
            <RemoteButton
              disabled={remoteDisabled}
              label={commands.volumeUp}
              icon={<Volume2 size={18} />}
              onClick={() => send("volumeUp")}
            />
            <RemoteButton
              disabled={remoteDisabled}
              label={commands.volumeDown}
              icon={<Volume2 size={18} className="-scale-y-100" />}
              onClick={() => send("volumeDown")}
            />
          </div>
        )}
        {selectedAvailable?.canSelectInput && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-bold text-slate-600">Inputs</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                ["inputTuner", "inputHdmi1", "inputHdmi2", "inputHdmi3", "inputHdmi4"] as const
              ).map((command) => (
                <RemoteButton
                  disabled={remoteDisabled}
                  key={command}
                  label={commands[command]}
                  onClick={() => send(command)}
                />
              ))}
            </div>
          </div>
        )}
        {selectedAvailable && (
          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-bold text-slate-600">Apps</p>
            <div className="flex gap-2">
              <select
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={appId}
                onChange={(event) => setAppId((event.currentTarget as HTMLSelectElement).value)}
                disabled={remoteDisabled || appsQuery.isPending}
              >
                <option value="">Select an installed app</option>
                {appsQuery.data?.apps.map((app) => (
                  <option value={app.id} key={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={!appId || remoteDisabled || launchMutation.isPending}
                onClick={() => launchMutation.mutate(appId)}
              >
                Launch
              </button>
            </div>
            {appsQuery.error && <p className="text-sm text-red-700">Unable to load apps.</p>}
            {launchMutation.error && (
              <p className="text-sm text-red-700">{launchMutation.error.message}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RemoteButton({
  label,
  ariaLabel,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  icon?: ComponentChildren;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-200 px-2 py-3 text-sm font-bold leading-none text-slate-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-50"
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ?? label}
    </button>
  );
}
