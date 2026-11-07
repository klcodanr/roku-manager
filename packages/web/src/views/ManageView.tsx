import { useRoute } from "wouter-preact";
import { ManageLayout } from "../components/ManageLayout";
import { DiagnosticsView } from "./DiagnosticsView";
import { HistoryView } from "./HistoryView";
import { SessionView } from "./SessionView";
import { SettingsView } from "./SettingsView";

export function ManageView() {
  const [, params] = useRoute("/manage/:deviceId/:section?");
  const deviceId = params?.deviceId ?? "";
  const section = params?.section;
  const active =
    section === "settings" || section === "history" || section === "diagnostics"
      ? section
      : "session";
  const View =
    active === "settings"
      ? SettingsView
      : active === "history"
        ? HistoryView
        : active === "diagnostics"
          ? DiagnosticsView
          : SessionView;

  return (
    <ManageLayout active={active} deviceId={deviceId}>
      <View deviceId={deviceId} />
    </ManageLayout>
  );
}
