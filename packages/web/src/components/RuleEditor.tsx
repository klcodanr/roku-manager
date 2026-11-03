import type { DeviceRule } from "@roku-manager/core";

export const defaultRule = (): DeviceRule => ({
  name: "New rule",
  days: [1, 2, 3, 4, 5],
  start: "15:00",
  end: "21:00",
  maxMinutes: 60,
  limitBehavior: "rest_of_day",
});

export function RuleEditor({
  rule,
  index,
  onChange,
  onRemove,
}: {
  rule: DeviceRule;
  index: number;
  onChange: (rule: DeviceRule) => void;
  onRemove: () => void;
}) {
  const update = <K extends keyof DeviceRule>(key: K, value: DeviceRule[K]) =>
    onChange({ ...rule, [key]: value });
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.1em] text-blue-700">
            Rule {index + 1}
          </p>
        </div>
        <button
          className="bg-transparent px-1 py-1 font-bold text-red-700 hover:bg-red-100"
          type="button"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      <label className="font-bold">
        Rule name
        <input
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"
          value={rule.name}
          onInput={(e) => update("name", e.currentTarget.value)}
        />
      </label>
      <fieldset>
        <legend className="mb-1.5 font-bold">Days active</legend>
        <div className="grid grid-cols-7 rounded-lg border border-slate-200 bg-white p-2 text-center">
          {days.map((day, index) => (
            <label
              className="flex flex-col items-center gap-1 text-xs font-bold uppercase text-slate-600"
              key={day}
            >
              <span>{day}</span>
              <input
                type="checkbox"
                checked={rule.days.includes(index)}
                onChange={(e) =>
                  update(
                    "days",
                    e.currentTarget.checked
                      ? [...rule.days, index].sort()
                      : rule.days.filter((item) => item !== index),
                  )
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 font-bold">Active time</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <label className="font-semibold text-slate-600">
            Start
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-normal text-slate-900"
              type="time"
              value={rule.start}
              onInput={(e) => update("start", e.currentTarget.value)}
            />
          </label>
          <span className="hidden pb-2.5 text-center text-slate-500 sm:block">to</span>
          <label className="font-semibold text-slate-600">
            End
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-normal text-slate-900"
              type="time"
              value={rule.end}
              onInput={(e) => update("end", e.currentTarget.value)}
            />
          </label>
        </div>
      </fieldset>
      <div className="flex flex-col gap-3">
        <label className="font-bold">
          Usage limit (minutes)
          <input
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal"
            type="number"
            min="1"
            value={rule.maxMinutes}
            onInput={(e) => update("maxMinutes", Number(e.currentTarget.value))}
          />
        </label>
        <label className="font-bold">
          Limit behavior
          <select
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"
            value={rule.limitBehavior}
            onChange={(e) =>
              update("limitBehavior", e.currentTarget.value as DeviceRule["limitBehavior"])
            }
          >
            <option value="rest_of_day">Rest of day</option>
            <option value="cooldown">Cooldown</option>
          </select>
        </label>
        {rule.limitBehavior === "cooldown" && (
          <label className="font-bold">
            Cooldown minutes
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal"
              type="number"
              min="1"
              value={rule.cooldownMinutes}
              onInput={(e) =>
                onChange({
                  ...rule,
                  limitBehavior: "cooldown",
                  cooldownMinutes: Number(e.currentTarget.value),
                })
              }
            />
          </label>
        )}
      </div>
    </div>
  );
}
