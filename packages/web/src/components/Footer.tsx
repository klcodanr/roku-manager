import { useServerTime } from "../hooks/useServerTime";

export const Footer = () => {
  const serverTime = useServerTime();
  return (
    <footer className="mt-7 text-center text-xs text-slate-500" aria-live="polite">
      {serverTime}
    </footer>
  );
};
