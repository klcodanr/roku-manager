import Chart from "chart.js/auto";
import { useEffect, useRef } from "preact/hooks";
import type { EventsSummary } from "@roku-manager/core";

const statusNames = ["failed", "none", "succeeded"] as const;
const statusColors = ["#b24b44", "#64748b", "#15803d"];

function formatDate(value: Date | number | string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function percentage(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

export function HistoryCharts({ history }: { history: EventsSummary }) {
  const usageCanvas = useRef<HTMLCanvasElement>(null);
  const statusCanvas = useRef<HTMLCanvasElement>(null);
  const enforcementCanvas = useRef<HTMLCanvasElement>(null);
  const activityCanvas = useRef<HTMLCanvasElement>(null);
  const appsCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (
      !usageCanvas.current ||
      !statusCanvas.current ||
      !enforcementCanvas.current ||
      !activityCanvas.current ||
      !appsCanvas.current
    )
      return;
    const usageLabels = history.series.map((event) => formatDate(event.timestamp));
    const points = history.series.map((event, index) => ({
      x: index,
      y: event.usedMinutes,
    }));
    const dailyResults = new Map<number, Record<(typeof statusNames)[number], number>>();
    for (const event of history.series) {
      const date = new Date(event.timestamp);
      date.setHours(0, 0, 0, 0);
      const timestamp = date.getTime();
      const counts = dailyResults.get(timestamp) ?? { failed: 0, none: 0, succeeded: 0 };
      counts.failed += event.statusCounts.failed;
      counts.none += event.statusCounts.none;
      counts.succeeded += event.statusCounts.succeeded;
      dailyResults.set(timestamp, counts);
    }
    const cumulativeResults = [...dailyResults.entries()].sort(([dateA], [dateB]) => dateA - dateB);
    const statusLabels = cumulativeResults.map(([timestamp]) => formatDate(timestamp));
    const statusPoints = statusNames.map((status) => {
      let total = 0;
      return {
        label: status === "failed" ? "Failed" : status === "none" ? "No action" : "Succeeded",
        data: cumulativeResults.map(([, counts], index) => {
          total += counts[status];
          return { x: index, y: total };
        }),
      };
    });
    const usageChart = new Chart(usageCanvas.current, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Used minutes",
            data: points,
            borderColor: "#1769aa",
            backgroundColor: "rgba(23, 105, 170, 0.12)",
            pointBackgroundColor: history.series.map((event) =>
              event.enforcementStatus === "failed" ? "#b24b44" : "#1769aa",
            ),
            pointRadius: 4,
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "category",
            labels: usageLabels,
            title: { display: true, text: "Date" },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Minutes" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => (items[0] ? usageLabels[Number(items[0].parsed.x)] : ""),
            },
          },
        },
      },
    });
    const statusChart = new Chart(statusCanvas.current, {
      type: "line",
      data: {
        datasets: statusPoints.map((dataset, index) => ({
          ...dataset,
          borderColor: statusColors[index],
          backgroundColor: statusColors[index],
          pointRadius: 3,
          tension: 0.2,
        })),
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "category",
            labels: statusLabels,
            title: { display: true, text: "Date" },
          },
          y: { beginAtZero: true, title: { display: true, text: "Cumulative checks" } },
        },
        plugins: {
          legend: { display: true, position: "bottom" },
          tooltip: {
            callbacks: {
              title: (items) => (items[0] ? statusLabels[Number(items[0].parsed.x)] : ""),
            },
          },
        },
      },
    });
    const enforcementValues = [
      history.failed,
      Math.max(0, history.total - history.failed - history.succeeded),
      history.succeeded,
    ];
    const enforcementTotal = enforcementValues.reduce((sum, value) => sum + value, 0);
    const enforcementLabels = ["Failed", "No action", "Succeeded"].map(
      (label, index) => `${label} (${percentage(enforcementValues[index], enforcementTotal)})`,
    );
    const enforcementChart = new Chart(enforcementCanvas.current, {
      type: "doughnut",
      data: {
        labels: enforcementLabels,
        datasets: [
          {
            data: enforcementValues,
            backgroundColor: ["#b24b44", "#94a3b8", "#15803d"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.raw}`,
            },
          },
        },
      },
    });
    const activityValues = [history.active, Math.max(0, history.total - history.active)];
    const activityTotal = activityValues.reduce((sum, value) => sum + value, 0);
    const activityLabels = ["Active", "Idle"].map(
      (label, index) => `${label} (${percentage(activityValues[index], activityTotal)})`,
    );
    const activityChart = new Chart(activityCanvas.current, {
      type: "doughnut",
      data: {
        labels: activityLabels,
        datasets: [
          {
            data: activityValues,
            backgroundColor: ["#1769aa", "#cbd5e1"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.raw}`,
            },
          },
        },
      },
    });
    const appEntries = Object.entries(history.apps).sort(
      ([, countA], [, countB]) => countB - countA,
    );
    const appValues = appEntries.length ? appEntries.map(([, count]) => count) : [1];
    const appTotal = appValues.reduce((sum, value) => sum + value, 0);
    const appLabels = appEntries.length
      ? appEntries.map(([app], index) => `${app} (${percentage(appValues[index], appTotal)})`)
      : ["No app data (100.0%)"];
    const appsChart = new Chart(appsCanvas.current, {
      type: "doughnut",
      data: {
        labels: appLabels,
        datasets: [
          {
            data: appValues,
            backgroundColor: ["#1769aa", "#7c3aed", "#0891b2", "#d97706", "#db2777", "#64748b"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.raw}`,
            },
          },
        },
      },
    });

    return () => {
      usageChart.destroy();
      statusChart.destroy();
      enforcementChart.destroy();
      activityChart.destroy();
      appsChart.destroy();
    };
  }, [history]);

  return (
    <div className="mt-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-600">Usage over time</h3>
          <div className="h-64">
            <canvas ref={usageCanvas} aria-label="Usage minutes over time" role="img" />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-600">Enforcement results over time</h3>
          <div className="h-64">
            <canvas ref={statusCanvas} aria-label="Enforcement results over time" role="img" />
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-600">Enforcement results</h3>
          <div className="h-64">
            <canvas
              ref={enforcementCanvas}
              aria-label="Distribution of enforcement results"
              role="img"
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-600">Activity</h3>
          <div className="h-64">
            <canvas
              ref={activityCanvas}
              aria-label="Distribution of active and idle checks"
              role="img"
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-600">Apps used</h3>
          <div className="h-64">
            <canvas ref={appsCanvas} aria-label="Distribution of apps used" role="img" />
          </div>
        </div>
      </div>
    </div>
  );
}
