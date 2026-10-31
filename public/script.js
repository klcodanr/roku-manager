/** @typedef {{ start: string, end: string }} BlockedWindow */
/** @typedef {import('../src/api').RokuDevice} Device */
/** @typedef {import('../src/api').SessionSummary} SessionSummary */
/** @typedef {{ deviceId: string, maxMinutes: number | null, blockedWindows: BlockedWindow[], limitBehavior: 'rest_of_day' | 'cooldown', cooldownMinutes: number }} DeviceSettings */
/** @typedef {{ name: 'devices' } | { name: 'manage', id: string }} Route */
/** @typedef {{ devices: Device[] }} DeviceResponse */
/** @typedef {{ timestamp: string, deviceId: string, active: boolean, appName: string | null, enforcementStatus: string, enforcementEvent: string, usedMinutes: number, lockedUntil: string | null }} DeviceEvent */
/** @typedef {{ total: number, active: number, idle: number, succeeded: number, failed: number, notNeeded: number, apps: Record<string, number>, series: Array<{ timestamp: string, usedMinutes: number, enforcementStatus: string }> }} EventMetrics */
/** @typedef {{ events: DeviceEvent[], metrics: EventMetrics }} EventHistory */
/** @typedef {{ devices: Device[], settings: Record<string, DeviceSettings>, sessions: Record<string, SessionSummary>, events: Record<string, EventHistory>, settingsRequests: Set<string>, loading: boolean, error: string | null }} AppState */

const appElement = document.querySelector("#app");
const refreshElement = document.querySelector("#refresh");
const serverTimeElement = document.querySelector("#server-time");
if (!(appElement instanceof HTMLElement) || !(refreshElement instanceof HTMLButtonElement))
  throw new Error("Required application elements are missing");
if (!(serverTimeElement instanceof HTMLElement)) throw new Error("Server time element is missing");
const app = appElement;
const refreshButton = refreshElement;
const serverTime = serverTimeElement;
/** @type {AppState} */
const state = {
  devices: [],
  settings: {},
  sessions: {},
  events: {},
  settingsRequests: new Set(),
  loading: false,
  error: null,
};

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {Record<string, unknown>} [properties] @param {(Node | null)[]} [children] @returns {HTMLElementTagNameMap[K]} */
function el(tag, properties = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(properties)) {
    if (key === "class" && typeof value === "string") element.className = value;
    else if (key === "text" && typeof value === "string") element.textContent = value;
    else if (key === "dataset" && typeof value === "object" && value !== null)
      Object.assign(element.dataset, value);
    else if (key === "style" && typeof value === "string") element.setAttribute("style", value);
    else if (key in element) Reflect.set(element, key, value);
    else element.setAttribute(key, String(value));
  }
  element.append(...children.filter((child) => child !== null));
  return element;
}

/** @param {unknown} value @returns {Text} */
function text(value) {
  return document.createTextNode(String(value ?? ""));
}

/** @returns {Route} */
function route() {
  const match = window.location.pathname.match(/^\/manage\/(.+)$/);
  return match ? { name: "manage", id: decodeURIComponent(match[1]) } : { name: "devices" };
}

/** @param {string} path */
function navigate(path) {
  window.history.pushState({}, "", path);
  render();
}

/** @template T @param {string} path @param {RequestInit} [options] @returns {Promise<T>} */
async function request(path, options) {
  const response = await fetch(path, { ...options, credentials: "same-origin" });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error || `Request failed (${response.status})`,
    );
  return /** @type {Promise<T>} */ (response.json());
}

/** @param {boolean} [refresh] */
async function loadDevices(refresh = false) {
  state.loading = true;
  state.error = null;
  render();
  refreshButton.disabled = true;
  try {
    state.devices = (await request(`/api/devices?refresh=${refresh}`)).devices;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    refreshButton.disabled = false;
    render();
  }
}

async function loadServerTime() {
  try {
    const response = await request("/api/server-time");
    const date = new Date(response.now);
    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: response.timeZone,
    }).format(date);
    serverTime.textContent = `Server time: ${formatted} (${response.timeZone})`;
  } catch {
    serverTime.textContent = "Server time unavailable";
  }
}

/** @param {string} id */
async function loadSettings(id) {
  state.settingsRequests.add(id);
  try {
    state.settings[id] = await request(`/api/devices/${encodeURIComponent(id)}/settings`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.settingsRequests.delete(id);
    const currentRoute = route();
    if (currentRoute.name === "manage" && currentRoute.id === id) render();
  }
}

/** @param {string} id */
async function loadSession(id) {
  try {
    state.sessions[id] = await request(`/api/devices/${encodeURIComponent(id)}/session`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    const currentRoute = route();
    if (currentRoute.name === "manage" && currentRoute.id === id) render();
  }
}

/** @param {string} id */
async function loadEvents(id) {
  try {
    state.events[id] = await request(`/api/devices/${encodeURIComponent(id)}/events`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    const currentRoute = route();
    if (currentRoute.name === "manage" && currentRoute.id === id) render();
  }
}

function render() {
  const currentRoute = route();
  app.replaceChildren();
  if (state.loading) {
    app.append(el("section", { class: "card" }, [el("p", { text: "Loading devices..." })]));
    return;
  }
  if (state.error) {
    const retry = el("button", { text: "Try again", dataset: { action: "retry" } });
    app.append(
      el("section", { class: "card error" }, [
        el("h1", { text: "Unable to load devices" }),
        el("p", { text: state.error }),
        retry,
      ]),
    );
    return;
  }
  if (currentRoute.name === "manage") renderManage(currentRoute.id);
  else renderDevices();
}

function renderDevices() {
  const heading = el("div", { class: "page-heading" }, [
    el("p", { class: "eyebrow", text: "Overview" }),
    el("h1", { text: "Devices" }),
  ]);
  const addForm = el("form", { class: "card add-device-form", dataset: { addDeviceForm: "" } }, [
    el("h2", { text: "Add a device by IP" }),
    el("label", {}, [
      text("Roku IP address"),
      el("input", { name: "ip", type: "text", placeholder: "192.168.1.17", required: true }),
    ]),
    el("div", { class: "form-actions" }, [
      el("button", { type: "submit", text: "Add device" }),
      el("span", { class: "form-message", dataset: { addDeviceMessage: "" } }),
    ]),
  ]);
  const content = state.devices.length
    ? el("div", { class: "grid" }, state.devices.map(deviceCard))
    : el("section", { class: "card" }, [
        el("p", {
          text: "No Roku devices found. Confirm network access is enabled on the Roku and that the container can access the LAN.",
        }),
      ]);
  app.append(heading, content, addForm);
}

/** @param {Device} device */
function deviceCard(device) {
  const name = deviceName(device);
  const heading = el("div", { class: "card-heading" }, [
    el("div", {}, [
      el("p", { class: "eyebrow", text: device.info?.modelName || "Roku device" }),
      el("h2", { text: name }),
    ]),
    el("span", { class: "status-pill", text: device.active ? "Active" : "Idle" }),
  ]);
  const manage = el("a", {
    class: "button",
    href: `/manage/${encodeURIComponent(device.deviceId)}`,
    dataset: { link: "" },
    text: "Manage limits",
  });
  const details = el("details", {}, [
    el("summary", { text: "Diagnostics" }),
    el("pre", { text: JSON.stringify(device, null, 2) }),
  ]);
  return el("section", { class: "card" }, [
    heading,
    el("p", { class: "muted" }, [
      text(device.ip),
      text(device.info?.userDeviceLocation ? ` · ${device.info.userDeviceLocation}` : ""),
    ]),
    el(
      "p",
      {},
      device.active
        ? [text("Currently active: "), el("strong", { text: device.active.name })]
        : [text("No active app reported")],
    ),
    el("p", { class: "muted" }, [
      text(device.canPowerOff ? "Can power off" : "Cannot power off; enforcement returns to Home"),
    ]),
    manage,
    details,
  ]);
}

/** @param {string} id */
function renderManage(id) {
  const device = state.devices.find((item) => item.deviceId === id);
  if (!device) {
    app.append(
      el("section", { class: "card" }, [
        el("h1", { text: "Device not found" }),
        el("p", { text: "Return to the device list and try again." }),
        link("/", "Back to devices"),
      ]),
    );
    return;
  }
  if (!state.settings[id]) {
    if (!state.settingsRequests.has(id)) loadSettings(id);
    app.append(el("section", { class: "card" }, [el("p", { text: "Loading settings..." })]));
    return;
  }
  if (!state.sessions[id]) {
    loadSession(id);
    app.append(el("section", { class: "card" }, [el("p", { text: "Loading session..." })]));
    return;
  }
  if (!state.events[id]) {
    loadEvents(id);
    app.append(el("section", { class: "card" }, [el("p", { text: "Loading event history..." })]));
    return;
  }
  const settings = state.settings[id];
  const session = state.sessions[id];
  const name = deviceName(device);
  const windows = el("div", { dataset: { windows: "" } }, settings.blockedWindows.map(windowRow));
  const form = el("form", { class: "card form", dataset: { deviceForm: id } }, [
    field(
      "Daily on-time limit (minutes)",
      el("input", {
        name: "maxMinutes",
        type: "number",
        min: "0",
        value: settings.maxMinutes ?? "",
        placeholder: "Unlimited",
      }),
      "Blank for unlimited",
    ),
    field(
      "When the limit is reached",
      el("select", { name: "limitBehavior" }, [
        el("option", {
          value: "rest_of_day",
          text: "Block for the rest of the day",
          selected: settings.limitBehavior === "rest_of_day",
        }),
        el("option", {
          value: "cooldown",
          text: "Use a cooldown period",
          selected: settings.limitBehavior === "cooldown",
        }),
      ]),
    ),
    field(
      "Cooldown period (minutes)",
      el("input", {
        name: "cooldownMinutes",
        type: "number",
        min: "1",
        value: settings.cooldownMinutes ?? 15,
      }),
      "Used when cooldown is selected",
    ),
    el("div", { class: "form-section" }, [
      el("div", { class: "section-heading" }, [
        el("div", {}, [
          el("h2", { text: "Blocked windows" }),
          el("p", { class: "muted", text: "Devices are powered off while a window is active." }),
        ]),
        el("button", {
          class: "secondary",
          type: "button",
          text: "Add window",
          dataset: { action: "add-window" },
        }),
      ]),
      windows,
    ]),
    el("div", { class: "form-actions" }, [
      el("button", { type: "submit", text: "Save limits" }),
      el("button", {
        class: "secondary",
        type: "button",
        text: "Reset settings",
        dataset: { action: "reset-settings" },
      }),
      el("span", { class: "form-message", dataset: { message: "" } }),
    ]),
  ]);
  app.append(
    el("div", { class: "page-heading" }, [
      link("/", "← Devices", "back-link"),
      el("p", { class: "eyebrow", text: "Manage" }),
      el("h1", { text: name }),
      el("p", { class: "muted", text: device.ip }),
    ]),
    sessionSummary(session, id),
    form,
    historySection(state.events[id]),
  );
}

/** @param {EventHistory} history @returns {HTMLElement} */
function historySection(history) {
  const { events, metrics } = history;
  if (!events.length)
    return el("section", { class: "card history" }, [
      el("h2", { text: "Device history" }),
      el("p", { class: "muted", text: "History will appear after the next enforcement check." }),
    ]);
  const appColors = ["#1769aa", "#3a8b5a", "#c47b2c", "#7957a8", "#b24b44", "#5b7182"];
  const appDistribution = Object.entries(metrics.apps).map(([label, value], index) => ({
    label,
    value,
    color: appColors[index % appColors.length],
  }));
  const latest = events[events.length - 1];
  return el("section", { class: "card history" }, [
    el("div", { class: "card-heading" }, [
      el("div", {}, [el("h2", { text: "Device history" })]),
      el("span", { class: "muted", text: `Last checked ${formatTime(latest.timestamp)}` }),
    ]),
    historyChart(metrics.series),
    el("div", { class: "history-stats" }, [
      donutChart("Observed state", [
        { label: "Active", value: metrics.active, color: "#1769aa" },
        { label: "Idle", value: metrics.idle, color: "#cbd5dc" },
      ]),
      donutChart("Enforcement", [
        { label: "Succeeded", value: metrics.succeeded, color: "#3a8b5a" },
        { label: "Failed", value: metrics.failed, color: "#b24b44" },
        { label: "Not needed", value: metrics.notNeeded, color: "#cbd5dc" },
      ]),
      donutChart(
        "App distribution",
        appDistribution.length
          ? appDistribution
          : [{ label: "No active app", value: events.length, color: "#cbd5dc" }],
      ),
    ]),
    el("br"),
    el("p", { class: "muted", text: `Last ${events.length} checks` }),
    el("div", { class: "event-list" }, events.slice(-8).reverse().map(eventRow)),
  ]);
}

/** @param {{ timestamp: string, usedMinutes: number, enforcementStatus: string }[]} events @returns {HTMLDivElement} */
function historyChart(events) {
  const width = 720;
  const height = 190;
  const padding = 22;
  const max = Math.max(1, ...events.map((event) => event.usedMinutes));
  const points = events
    .map((event, index) => {
      const x =
        padding + (events.length === 1 ? 0 : (index * (width - padding * 2)) / (events.length - 1));
      const y = height - padding - (event.usedMinutes / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const svg = svgEl("svg", {
    class: "history-chart",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Usage over all enforcement checks",
  });
  svg.append(
    svgEl("line", {
      x1: padding,
      y1: height - padding,
      x2: width - padding,
      y2: height - padding,
      class: "chart-axis",
    }),
    svgEl("polyline", { points, class: "chart-line" }),
  );
  events.forEach((event, index) => {
    const x =
      padding + (events.length === 1 ? 0 : (index * (width - padding * 2)) / (events.length - 1));
    const y = height - padding - (event.usedMinutes / max) * (height - padding * 2);
    svg.append(
      svgEl("circle", {
        cx: x,
        cy: y,
        r: 3.5,
        class:
          event.enforcementStatus === "failed" ? "chart-point chart-point-failure" : "chart-point",
      }),
    );
  });
  return el("div", { class: "chart-wrap" }, [
    el("div", { class: "chart-labels" }, [
      el("span", { text: "Usage minutes across all checks" }),
      el("span", { text: `${max}m max` }),
    ]),
    svg,
  ]);
}

/** @param {string} tag @param {Record<string, string | number>} properties @returns {SVGElement} */
function svgEl(tag, properties) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(properties)) element.setAttribute(key, String(value));
  return element;
}

/** @param {string} title @param {{label: string, value: number, color: string}[]} values @returns {HTMLElement} */
function donutChart(title, values) {
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;
  let start = 0;
  const stops = values
    .map((item) => {
      const end = start + (item.value / total) * 360;
      const stop = `${item.color} ${start}deg ${end}deg`;
      start = end;
      return stop;
    })
    .join(", ");
  return el("div", { class: "donut-card" }, [
    el("h3", { text: title }),
    el("div", { class: "donut-body" }, [
      el("span", { class: "donut", style: `background: conic-gradient(${stops})` }),
      el(
        "div",
        { class: "legend" },
        values.map((item) => {
          const percentage = Math.round((item.value / total) * 100);
          return el("span", {}, [
            el("i", { style: `background:${item.color}` }),
            text(`${item.label} ${percentage}%`),
          ]);
        }),
      ),
    ]),
  ]);
}

/** @param {DeviceEvent} event @returns {HTMLElement} */
function eventRow(event) {
  const label =
    event.enforcementEvent === "none"
      ? event.active
        ? `Active · ${event.appName || "Unknown app"}`
        : "Idle"
      : event.enforcementEvent.replaceAll("_", " ");
  return el("div", { class: "event-row" }, [
    el("span", { class: "event-time", text: formatTime(event.timestamp) }),
    el("span", { text: label }),
    el("span", {
      class: event.enforcementStatus === "failed" ? "status-failure" : "muted",
      text: `${event.usedMinutes}m`,
    }),
  ]);
}

/** @param {SessionSummary} session @param {string} id @returns {HTMLElement} */
function sessionSummary(session, id) {
  const actual =
    session.actual.state === "active"
      ? `Playing ${session.actual.appName}`
      : session.actual.state === "idle"
        ? "Idle"
        : "Unknown";
  const expected =
    session.expected.state === "blocked"
      ? "Blocked time"
      : session.expected.state === "daily_limit"
        ? "Daily limit"
        : session.expected.state === "cooldown"
          ? "Cooldown"
          : "No block expected";
  const enforcement =
    session.enforcement.state === "failed"
      ? "Failed"
      : session.enforcement.state === "succeeded"
        ? "Succeeded"
        : "Not needed";
  const enforcementClass =
    session.enforcement.state === "failed"
      ? "status status-failure"
      : session.enforcement.state === "succeeded"
        ? "status status-success"
        : "status status-neutral";
  /** @param {string} label @param {string} value @param {string} [className] @returns {HTMLDivElement} */
  const statusRow = (label, value, className = "") =>
    el("div", { class: "session-row" }, [
      el("span", { class: "session-label", text: label }),
      el("span", { class: className, text: value }),
    ]);
  const remaining = session.expected.remainingSeconds
    ? ` · ${formatDuration(session.expected.remainingSeconds)} remaining`
    : "";
  return el("section", { class: "card session-summary" }, [
    el("div", { class: "card-heading" }, [el("h2", { text: "Current session" })]),
    el("div", { class: "session-rows" }, [
      statusRow("Total duration", formatDuration(session.totalSeconds)),
      statusRow("Actual", actual),
      statusRow("Expected", expected),
      statusRow("Enforcement", enforcement, enforcementClass),
      session.expected.endsAt
        ? statusRow("Expected end", `${formatTime(session.expected.endsAt)}${remaining}`, "muted")
        : null,
      session.enforcement.detail
        ? el("p", { class: "session-detail status-failure", text: session.enforcement.detail })
        : null,
    ]),
    el("div", { class: "form-actions session-actions" }, [
      el("button", {
        type: "button",
        text: "Run enforcement",
        dataset: { action: "run-enforcement", deviceId: id },
      }),
      el("button", {
        class: "secondary",
        type: "button",
        text: "Reset session",
        dataset: { action: "reset-session", deviceId: id },
      }),
      el("span", { class: "form-message", dataset: { enforcementMessage: "" } }),
    ]),
  ]);
}

/** @param {number} seconds @returns {string} */
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** @param {string} value @returns {string} */
function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** @param {Device} device @returns {string} */
function deviceName(device) {
  const name = device.info?.friendlyDeviceName || device.info?.userDeviceName || device.deviceId;
  const location = device.info?.userDeviceLocation;
  return location ? `${name} (${location})` : name;
}

/** @param {string} label @param {HTMLElement} input @param {string} [hint] @returns {HTMLLabelElement} */
function field(label, input, hint = "") {
  return el("label", {}, [
    text(label),
    hint ? el("span", { class: "muted", text: ` (${hint})` }) : null,
    input,
  ]);
}

/** @param {string} href @param {string} label @param {string} [className] @returns {HTMLAnchorElement} */
function link(href, label, className = "button") {
  return el("a", { class: className, href, dataset: { link: "" }, text: label });
}

/** @param {BlockedWindow} [values] @returns {HTMLDivElement} */
function windowRow(values = { start: "22:00", end: "07:00" }) {
  return el("div", { class: "window" }, [
    el("input", { name: "start", type: "time", value: values.start, required: true }),
    el("span", { text: "to" }),
    el("input", { name: "end", type: "time", value: values.end, required: true }),
    el("button", {
      class: "text-button",
      type: "button",
      text: "Remove",
      dataset: { action: "remove-window" },
    }),
  ]);
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const linkElement = target.closest("[data-link]");
  if (linkElement) {
    event.preventDefault();
    const href = linkElement.getAttribute("href");
    if (href) navigate(href);
    return;
  }
  const actionElement = target.closest("[data-action]");
  const action = actionElement instanceof HTMLElement ? actionElement.dataset.action : undefined;
  if (action === "retry") loadDevices(true);
  const form = target.closest("form");
  if (action === "add-window" && form) form.querySelector("[data-windows]")?.append(windowRow());
  if (action === "remove-window") target.closest(".window")?.remove();
  if (action === "reset-settings" && form instanceof HTMLFormElement) resetSettings(form);
  if (action === "run-enforcement")
    runEnforcement(actionElement instanceof HTMLElement ? actionElement : null);
  if (action === "reset-session")
    resetSession(actionElement instanceof HTMLElement ? actionElement : null);
});

/** @param {HTMLElement | null} actionElement */
async function runEnforcement(actionElement) {
  if (!actionElement) return;
  const id = actionElement.dataset.deviceId;
  const message = actionElement
    .closest(".session-summary")
    ?.querySelector("[data-enforcement-message]");
  if (!id || !(message instanceof HTMLElement)) throw new Error("Enforcement controls are missing");
  actionElement.setAttribute("disabled", "true");
  message.textContent = "Running enforcement...";
  try {
    await request("/api/enforce", { method: "POST" });
    delete state.sessions[id];
    delete state.events[id];
    await loadDevices(true);
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
    actionElement.removeAttribute("disabled");
  }
}

/** @param {HTMLElement | null} actionElement */
async function resetSession(actionElement) {
  if (!actionElement) return;
  const id = actionElement.dataset.deviceId;
  if (!id || !window.confirm("Reset this session's usage and lockout state?")) return;
  const message = actionElement
    .closest(".session-summary")
    ?.querySelector("[data-enforcement-message]");
  if (!(message instanceof HTMLElement)) throw new Error("Session controls are missing");
  actionElement.setAttribute("disabled", "true");
  message.textContent = "Resetting session...";
  try {
    await request(`/api/devices/${encodeURIComponent(id)}/session`, { method: "DELETE" });
    delete state.sessions[id];
    render();
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
    actionElement.removeAttribute("disabled");
  }
}

/** @param {HTMLFormElement} form */
async function resetSettings(form) {
  if (!window.confirm("Reset all saved limits and usage for this device?")) return;
  const message = form.querySelector("[data-message]");
  if (!(message instanceof HTMLElement)) throw new Error("Form message element is missing");
  const id = form.dataset.deviceForm;
  if (!id) throw new Error("Device id is missing");
  message.textContent = "Resetting...";
  try {
    const settings = await request(`/api/devices/${encodeURIComponent(id)}/settings`, {
      method: "DELETE",
    });
    state.settings[id] = settings;
    render();
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
  }
}

document.addEventListener("submit", async (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form) return;
  if (form.matches("[data-add-device-form]")) {
    event.preventDefault();
    const input = form.querySelector('[name="ip"]');
    const message = form.querySelector("[data-add-device-message]");
    if (!(input instanceof HTMLInputElement) || !(message instanceof HTMLElement)) return;
    message.textContent = "Adding...";
    try {
      await request("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ip: input.value.trim() }),
      });
      input.value = "";
      await loadDevices();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error);
    }
    return;
  }
  if (!form.matches("[data-device-form]")) return;
  event.preventDefault();
  const message = form.querySelector("[data-message]");
  const maxInput = form.querySelector('[name="maxMinutes"]');
  const behaviorInput = form.querySelector('[name="limitBehavior"]');
  const cooldownInput = form.querySelector('[name="cooldownMinutes"]');
  if (
    !(message instanceof HTMLElement) ||
    !(maxInput instanceof HTMLInputElement) ||
    !(behaviorInput instanceof HTMLSelectElement) ||
    !(cooldownInput instanceof HTMLInputElement)
  )
    throw new Error("Form fields are missing");
  const windows = [...form.querySelectorAll(".window")].map((row) => {
    const start = row.querySelector('[name="start"]');
    const end = row.querySelector('[name="end"]');
    if (!(start instanceof HTMLInputElement) || !(end instanceof HTMLInputElement))
      throw new Error("Blocked window fields are missing");
    return { start: start.value, end: end.value };
  });
  const max = maxInput.value;
  message.textContent = "Saving...";
  try {
    const id = form.dataset.deviceForm;
    if (!id) throw new Error("Device id is missing");
    const cooldown = cooldownInput.value;
    const settings = await request(`/api/devices/${encodeURIComponent(id)}/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxMinutes: max === "" ? null : Number(max),
        blockedWindows: windows,
        limitBehavior: behaviorInput.value,
        cooldownMinutes: cooldown === "" ? 15 : Number(cooldown),
      }),
    });
    state.settings[id] = settings;
    message.textContent = "Saved";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
  }
});

refreshButton.addEventListener("click", () => loadDevices(true));
window.addEventListener("popstate", render);

await loadServerTime();
setInterval(loadServerTime, 15_000);
await loadDevices();

export {};
