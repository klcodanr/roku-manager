import { LoaderCircle } from "lucide-preact";

export function RouteLoading({ message = "Loading..." }: { message?: string }) {
  return (
    <section
      className="flex min-h-32 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="h-10 w-10 animate-spin text-blue-700" aria-hidden="true" />
      <span>{message}</span>
    </section>
  );
}

export function RouteError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-5">
      <h1 className="text-2xl font-bold">Unable to load device</h1>
      <p>{message}</p>
      <button
        className="rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white"
        onClick={() => onRetry()}
      >
        Try again
      </button>
    </section>
  );
}
