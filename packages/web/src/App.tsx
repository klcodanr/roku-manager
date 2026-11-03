import { createHashHistory } from "history";
import Router, { Route, type CustomHistory } from "preact-router";
import { Link } from "./components/Link";
import { useDevices } from "./hooks/useDevices";
import { useServerTime } from "./hooks/useServerTime";
import { DevicesView } from "./views/DevicesView";
import { HistoryView } from "./views/HistoryView";
import { SessionView } from "./views/SessionView";
import { SettingsView } from "./views/SettingsView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { RemoteView } from "./views/RemoteView";
import { isAvailable } from "./utils";
import { useDeviceDetails } from "./hooks/useDeviceDetails";
import { DeviceHeader } from "./components/DeviceHeader";
import type { ComponentChildren } from "preact";

const browserHistory = createHashHistory();
const history: CustomHistory = {
  get location() {
    return browserHistory.location;
  },
  listen(callback) {
    return browserHistory.listen(({ location }) => callback(location));
  },
  push(path) {
    browserHistory.push(path);
  },
  replace(path) {
    browserHistory.replace(path);
  },
};

function DevicesRoute({
  devices,
  onRefresh,
}: {
  devices: Parameters<typeof DevicesView>[0]["devices"];
  onRefresh: () => void;
}) {
  return <DevicesView devices={devices} onRefresh={onRefresh} />;
}

function ManageRoute({
  id,
  page,
  devices,
  onReloadDevices,
}: {
  id?: string;
  page: "session" | "settings" | "history" | "diagnostics";
  devices: Parameters<typeof DevicesView>[0]["devices"];
  onReloadDevices: () => void;
}) {
  const deviceId = id ? decodeURIComponent(id) : null;
  const device = deviceId ? devices.find((item) => item.deviceId === deviceId) : null;
  const includeSession = page === "session" && Boolean(device && isAvailable(device));
  const { details, loading, error, reload } = useDeviceDetails(deviceId, includeSession);

  if (!device) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Device not found</h1>
        <Link href="/">Back to devices</Link>
      </section>
    );
  }
  let content: ComponentChildren;
  if (!isAvailable(device) && page === "session") {
    content = (
      <section className="rounded-2xl border border-red-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Device is unavailable</h1>
        <p className="mt-2">{device.error}</p>
      </section>
    );
  } else if (error) {
    content = (
      <section className="rounded-2xl border border-red-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Unable to load device</h1>
        <p>{error}</p>
        <button
          className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white"
          onClick={() => reload()}
        >
          Try again
        </button>
      </section>
    );
  } else if (loading || !details) {
    content = (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        Loading device details...
      </section>
    );
  } else if (page === "history") {
    content = <HistoryView device={device} />;
  } else if (page === "diagnostics") {
    content = <DiagnosticsView device={device} />;
  } else if (page === "settings") {
    content = <SettingsView device={device} initialSettings={details.settings} />;
  } else if (details.session && isAvailable(device)) {
    content = (
      <SessionView
        device={device}
        initialSession={details.session}
        onReload={() => {
          reload();
          onReloadDevices();
        }}
      />
    );
  } else {
    content = null;
  }

  return (
    <>
      <DeviceHeader device={device} active={page} />
      {content}
    </>
  );
}

export function App() {
  const { devices, loading, error, reload: reloadDevices } = useDevices();
  const serverTime = useServerTime();

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-7 pb-16 sm:px-6">
      <header className="mb-14 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-slate-800">
          Roku Manager
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/" className="font-semibold text-slate-600 hover:text-blue-700">
            Devices
          </Link>
          <Link href="/remote" className="font-semibold text-slate-600 hover:text-blue-700">
            Remote
          </Link>
          <button
            className="rounded-lg bg-slate-200 px-3.5 py-2.5 font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            onClick={() => reloadDevices(true)}
            disabled={loading}
          >
            Refresh
          </button>
        </nav>
      </header>
      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          Loading devices...
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-red-200 bg-white p-5">
          <h1 className="text-2xl font-bold">Unable to load devices</h1>
          <p>{error}</p>
          <button
            className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white"
            onClick={() => {
              reloadDevices(true);
            }}
          >
            Try again
          </button>
        </section>
      ) : (
        <Router history={history}>
          <Route
            path="/"
            component={DevicesRoute}
            devices={devices}
            onRefresh={() => reloadDevices()}
          />
          <Route path="/remote" component={() => <RemoteView devices={devices} />} />
          <Route
            path="/manage/:id/history"
            component={ManageRoute}
            page="history"
            devices={devices}
            onReloadDevices={() => reloadDevices(true)}
          />
          <Route
            path="/manage/:id/settings"
            component={ManageRoute}
            page="settings"
            devices={devices}
            onReloadDevices={() => reloadDevices(true)}
          />
          <Route
            path="/manage/:id/diagnostics"
            component={ManageRoute}
            page="diagnostics"
            devices={devices}
            onReloadDevices={() => reloadDevices(true)}
          />
          <Route
            path="/manage/:id"
            component={ManageRoute}
            page="session"
            devices={devices}
            onReloadDevices={() => reloadDevices(true)}
          />
        </Router>
      )}
      <footer className="mt-7 text-center text-xs text-slate-500" aria-live="polite">
        {serverTime}
      </footer>
    </main>
  );
}
