import { Route, Router, Switch } from "wouter-preact";
import { useHashLocation } from "wouter-preact/use-hash-location";
import { Link } from "./components/Link";
import { RouteLoading } from "./components/RouteStatus";
import { useDevices } from "./hooks/useDevices";
import { useServerTime } from "./hooks/useServerTime";
import { DevicesView } from "./views/DevicesView";
import { ManageView } from "./views/ManageView";
import { RemoteView } from "./views/RemoteView";

function NotFound() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/">Back to devices</Link>
    </section>
  );
}

export function App() {
  const { loading, error, reload: reloadDevices } = useDevices();
  const serverTime = useServerTime();

  return (
    <Router hook={useHashLocation}>
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
              onClick={() => reloadDevices()}
              disabled={loading}
            >
              Refresh
            </button>
          </nav>
        </header>
        {loading ? (
          <RouteLoading message="Loading devices..." />
        ) : error ? (
          <section className="rounded-2xl border border-red-200 bg-white p-5">
            <h1 className="text-2xl font-bold">Unable to load devices</h1>
            <p>{error}</p>
            <button
              className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white"
              onClick={() => reloadDevices()}
            >
              Try again
            </button>
          </section>
        ) : (
          <Switch>
            <Route path="/" component={DevicesView} />
            <Route path="/remote" component={RemoteView} />
            <Route path="/manage/:deviceId/:section?" component={ManageView} />
            <Route component={NotFound} />
          </Switch>
        )}
        <footer className="mt-7 text-center text-xs text-slate-500" aria-live="polite">
          {serverTime}
        </footer>
      </main>
    </Router>
  );
}
