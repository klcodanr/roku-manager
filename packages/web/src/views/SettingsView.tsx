import { useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/preact-query";
import { resetSettings, updateSettings } from "../api";
import { RuleEditor, defaultRule } from "../components/RuleEditor";
import { RulePreview } from "../components/RulePreview";
import type { DeviceRule, DeviceSettings, RokuDevice } from "@roku-manager/core";

export function SettingsView({
  device,
  initialSettings,
}: {
  device: RokuDevice;
  initialSettings: DeviceSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const settingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deviceSettings", device.deviceId] }),
  });
  const resetSettingsMutation = useMutation({
    mutationFn: resetSettings,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deviceSettings", device.deviceId] }),
  });
  const rules = settings.rules;
  const updateRule = (index: number, rule: DeviceRule) =>
    setSettings({
      ...settings,
      rules: rules.map((item, itemIndex) => (itemIndex === index ? rule : item)),
    });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    setMessage("Saving...");
    try {
      setSettings(await settingsMutation.mutateAsync(settings));
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function resetAll() {
    if (!window.confirm("Reset all saved limits and usage for this device?")) return;
    setMessage("Resetting...");
    try {
      setSettings(await resetSettingsMutation.mutateAsync(device.deviceId));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <form
      onSubmit={save}
      className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5"
    >
      <label className="mb-5 flex items-center gap-3 font-bold">
        <input
          type="checkbox"
          checked={settings.enforcementEnabled}
          onChange={(event) =>
            setSettings({
              ...settings,
              enforcementEnabled: event.currentTarget.checked,
            })
          }
        />
        Enable enforcement for this device
      </label>
      <RulePreview rules={rules} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Rules</h2>
          <p className="text-slate-500">The first rule matching the day and time is applied.</p>
        </div>
        <button
          className="rounded-lg bg-slate-200 px-3.5 py-2.5 font-bold text-slate-700 hover:bg-slate-300"
          type="button"
          onClick={() => setSettings({ ...settings, rules: [...rules, defaultRule()] })}
        >
          Add rule
        </button>
      </div>
      <div>
        {rules.map((rule, index) => (
          <RuleEditor
            key={index}
            index={index}
            rule={rule}
            onChange={(next) => updateRule(index, next)}
            onRemove={() =>
              setSettings({
                ...settings,
                rules: rules.filter((_, itemIndex) => itemIndex !== index),
              })
            }
          />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white hover:bg-blue-800"
          type="submit"
        >
          Save settings
        </button>
        <button
          className="rounded-lg bg-slate-200 px-3.5 py-2.5 font-bold text-slate-700 hover:bg-slate-300"
          type="button"
          onClick={resetAll}
        >
          Reset settings
        </button>
        <span className="font-bold text-green-700">{message}</span>
      </div>
    </form>
  );
}
