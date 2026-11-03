import type { RokuDevice } from "@roku-manager/core";
import { deviceName } from "../utils";

function labelFor(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function DiagnosticValue({ value }: { value: unknown }) {
  if (value === null) return <span className="font-mono text-slate-500">null</span>;
  if (typeof value !== "object") {
    return <span className="break-words font-mono text-slate-800">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="mt-2 grid gap-2 border-l-2 border-slate-200 pl-3">
        {value.map((item, index) => (
          <div key={index}>
            <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">
              {index}
            </div>
            <DiagnosticValue value={item} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 grid gap-2 border-l-2 border-slate-200 pl-3">
      {Object.entries(value).map(([key, child]) => (
        <div key={key} className="rounded-lg bg-white p-3">
          <div className="text-xs font-extrabold uppercase tracking-[.08em] text-slate-500">
            {labelFor(key)}
          </div>
          <DiagnosticValue value={child} />
        </div>
      ))}
    </div>
  );
}

function DiagnosticEntry({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs font-extrabold uppercase tracking-[.1em] text-slate-500">
        {labelFor(label)}
      </dt>
      <dd className="mt-1">
        <DiagnosticValue value={value} />
      </dd>
    </div>
  );
}

export function DiagnosticsView({ device }: { device: RokuDevice }) {
  const entries = Object.entries(device);
  const topLevelValues = entries.filter(([, value]) => value === null || typeof value !== "object");
  const nestedValues = entries.filter(([, value]) => value !== null && typeof value === "object");

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-[.13em] text-blue-700">
          Complete device response
        </p>
        <h1 className="mb-5 text-2xl font-bold">{deviceName(device)}</h1>
        <dl className="grid gap-3 sm:grid-cols-2">
          {topLevelValues.map(([key, value]) => (
            <DiagnosticEntry key={key} label={key} value={value} />
          ))}
        </dl>
        {nestedValues.length > 0 && (
          <div className="mt-5 grid gap-3">
            {nestedValues.map(([key, value]) => (
              <DiagnosticEntry key={key} label={key} value={value} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
