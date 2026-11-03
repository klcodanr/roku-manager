import type { DeviceRule } from "@roku-manager/core";

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function firstRuleAt(rules: DeviceRule[], day: number, minute: number) {
  const previousDay = (day + 6) % 7;
  const index = rules.findIndex((rule) => {
    const start = timeMinutes(rule.start);
    const end = timeMinutes(rule.end);
    return start < end
      ? rule.days.includes(day) && minute >= start && minute < end
      : (rule.days.includes(day) && minute >= start) ||
          (rule.days.includes(previousDay) && minute < end);
  });
  return index < 0 ? null : index;
}

export function RulePreview({ rules }: { rules: DeviceRule[] }) {
  const colors = ["#1769aa", "#3a8b5a", "#c47b2c", "#7957a8", "#b24b44", "#5b7182"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="mb-5 overflow-x-auto rounded-lg border border-slate-200 p-3.5">
      <h2 className="text-lg font-bold">Weekly schedule</h2>
      <p className="mb-3 text-slate-500">Colors show which rule is active first.</p>
      <div className="grid min-w-[360px] grid-cols-7 gap-1.5">
        {days.map((day, dayIndex) => (
          <div className="text-center" key={day}>
            <strong className="mb-1.5 block text-xs">{day}</strong>
            <div className="grid h-44 grid-rows-[repeat(24,minmax(4px,1fr))] gap-px">
              {Array.from({ length: 24 }, (_, hour) => {
                const index = firstRuleAt(rules, dayIndex, hour * 60 + 30);
                return (
                  <span
                    key={hour}
                    className="rounded-sm bg-slate-100"
                    style={index === null ? {} : { background: colors[index % colors.length] }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {rules.map((rule, index) => (
          <span className="inline-flex items-center gap-1.5 text-sm" key={index}>
            <i
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: colors[index % colors.length] }}
            />
            {rule.name || `Rule ${index + 1}`}
          </span>
        ))}
      </div>
    </div>
  );
}
