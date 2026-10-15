"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Device, SensorReading } from "@/lib/types";
import {
  evaluateThreshold,
  computeTrend,
  getRecommendation,
  computeQualityScore,
  qualityLabel,
  overallDeviceQuality,
} from "@/lib/decisionSupport";
import { assessPressure } from "@/lib/leakDetection";

// ── Small inline icons (no icon library dependency) ──────────────────────
function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const paths = {
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  thermometer: "M14 4a2 2 0 1 0-4 0v10.5a4 4 0 1 0 4 0V4Z",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  beaker: "M9 2h6M10 2v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V2",
  waves: "M2 8c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M2 15c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0",
  gauge: "M12 14 15 10M4 14a8 8 0 1 1 16 0",
  droplet: "M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z",
  battery: "M4 8h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM21 11v2",
  sim: "M8 2h6l4 4v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
  close: "M18 6 6 18M6 6l12 12",
};

const metricIcon: Record<string, keyof typeof paths> = {
  ph: "flask",
  temperature_ph: "thermometer",
  temperature_tds: "thermometer",
  conductivity: "bolt",
  tds: "beaker",
  salinity: "waves",
  level: "gauge",
  pressure: "gauge",
  flow: "droplet",
};

const metricLabel: Record<string, string> = {
  ph: "PH",
  temperature_ph: "Temperature of PH",
  temperature_tds: "Temperature of TDS",
  conductivity: "Conductivity",
  tds: "TDS",
  salinity: "Salinity",
  level: "Level Sensor",
  pressure: "Pressure",
  flow: "Flow",
};

const deviceTitleOverride: Record<string, string> = {
  "Ground Water Well": "Groundwater Monitoring Well",
  "Ground Water Reservoir": "Groundwater Recharge Tank",
};

// NOTE (2026-09-21): device.battery_pct actually holds a raw VOLTAGE
// reading for pressure sensors (e.g. 3.65), not a 0-100 percentage. An
// earlier attempt converted it to a percentage using an assumed 3.0V-3.6V
// curve, but that guess didn't match the old site's own battery gauge for
// the same sensor at the same time (old site: 51%, guessed conversion:
// 100%) — so rather than keep guessing at a formula we don't actually
// know, this shows the real measured voltage instead. Thresholds below are
// approximate for ER-series LiSOCl2 cells (nominal 3.6V): anything at or
// above 3.5V reads healthy, 3.2V-3.5V is a caution zone, below 3.2V is low.
function batteryTone(voltage: number | null) {
  if (voltage == null) return { bg: "bg-ink/5", text: "text-ink/40", bar: "bg-ink/20" };
  if (voltage < 3.2) return { bg: "bg-red-100", text: "text-red-600", bar: "bg-red-500" };
  if (voltage < 3.5) return { bg: "bg-amber-100", text: "text-amber-600", bar: "bg-amber-400" };
  return { bg: "bg-emerald-100", text: "text-emerald-600", bar: "bg-emerald-500" };
}

type RangeKey = "all" | "today" | "1h" | "12h" | "24h" | "custom";
type TabKey = "chart" | "table" | "stats" | "decision";

function isWithinRange(recordedAt: string, range: RangeKey, customStart: string, customEnd: string) {
  const t = new Date(recordedAt).getTime();
  const now = Date.now();
  switch (range) {
    case "all":
      return true;
    case "today": {
      const d = new Date(recordedAt);
      const n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    }
    case "1h":
      return t >= now - 60 * 60 * 1000;
    case "12h":
      return t >= now - 12 * 60 * 60 * 1000;
    case "24h":
      return t >= now - 24 * 60 * 60 * 1000;
    case "custom": {
      if (!customStart || !customEnd) return true;
      const start = new Date(customStart).getTime();
      const end = new Date(customEnd).getTime();
      return t >= start && t <= end;
    }
  }
}

export function SensorDetailPanel({
  device,
  readingsByMetric,
  onClose,
}: {
  device: Device;
  readingsByMetric: Map<string, SensorReading[]>;
  onClose: () => void;
}) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  // Defaults to "all" so switching to a sensor card shows its whole history
  // immediately — matching the old site, which never made you press a
  // range button first just to see a populated chart.
  const [range, setRange] = useState<RangeKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tab, setTab] = useState<TabKey>("chart");

  // Table tab: sortable timestamp column + pagination, matching the old
  // site's DataTables-style table (Show N entries / Previous-Next).
  // Defaults to "asc" (oldest → latest) — the old site's default reading
  // order — so there's nothing to flip on every visit.
  const [tableSort, setTableSort] = useState<"desc" | "asc">("asc");
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(10);
  const [tableQuery, setTableQuery] = useState("");

  useEffect(() => {
    setTablePage(1);
  }, [selectedMetric, range, tableQuery, tablePageSize]);

  // Only ever show metrics we actually know how to label/display. This is a
  // deliberate allowlist (not just "show whatever's in the DB") so a stray
  // one-off row inserted straight into sensor_readings — e.g. the old
  // "battery_voltage" row from 2026-09-08 that isn't written by any sync
  // route in this codebase — can never resurface as a fake extra card again,
  // even if something similar gets inserted by accident in the future.
  // Cards are ordered by freshness: metrics whose latest reading is newest come
  // first, so stale ones (e.g. a sensor last updated months ago) sink to the
  // bottom. Ties keep their original order (Array.sort is stable).
  const metrics = useMemo(() => {
    const latestTime = (m: string) => {
      const rows = readingsByMetric.get(m) ?? [];
      const t = rows.length ? new Date(rows[rows.length - 1].recorded_at).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    return Array.from(readingsByMetric.keys())
      .filter((m) => m in metricLabel)
      .sort((a, b) => latestTime(b) - latestTime(a));
  }, [readingsByMetric]);

  const historyForSelected = useMemo(() => {
    if (!selectedMetric) return [];
    const all = readingsByMetric.get(selectedMetric) ?? [];
    return all.filter((r) => isWithinRange(r.recorded_at, range, customStart, customEnd));
  }, [selectedMetric, readingsByMetric, range, customStart, customEnd]);

  const sortedTableRows = useMemo(() => {
    const rows = [...historyForSelected];
    rows.sort((a, b) => {
      const ta = new Date(a.recorded_at).getTime();
      const tb = new Date(b.recorded_at).getTime();
      return tableSort === "desc" ? tb - ta : ta - tb;
    });
    return rows;
  }, [historyForSelected, tableSort]);

  const filteredTableRows = useMemo(() => {
    if (!tableQuery.trim()) return sortedTableRows;
    const q = tableQuery.trim().toLowerCase();
    return sortedTableRows.filter(
      (r) => new Date(r.recorded_at).toLocaleString().toLowerCase().includes(q) || String(r.value).includes(q)
    );
  }, [sortedTableRows, tableQuery]);

  const tableTotalPages = Math.max(1, Math.ceil(filteredTableRows.length / tablePageSize));
  const tablePageRows = filteredTableRows.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);

  // Same latest<->oldest toggle as the Table tab (tableSort). sortedTableRows
  // is already ordered by it, so the chart's left-to-right direction just
  // follows whatever the person picked there.
  //
  // `time` is the short axis-tick label; `fullTime` is the full date+time
  // used in the hover tooltip (matches the old site's "Sep 22, 2026 4:01 AM"
  // style tooltip, which the compact axis label alone can't show).
  const chartData = sortedTableRows.map((r) => ({
    time: new Date(r.recorded_at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    fullTime: new Date(r.recorded_at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: Number(r.value),
  }));

  // Old-site-style dark tooltip: shows the full timestamp plus a single
  // "<Sensor Name>: <value> <unit>" line, only for the point being hovered
  // — not a swarm of always-visible dots.
  function ChartTooltip({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: { fullTime: string } }>;
    label?: string;
  }) {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0];
    const unit = historyForSelected[0]?.unit ?? "";
    return (
      <div className="rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg">
        <p className="font-semibold">{point.payload.fullTime}</p>
        <p className="mt-1 flex items-center gap-1.5 text-white/90">
          <span className="h-2 w-2 rounded-sm bg-blue-400" />
          {title}: {point.value} {unit}
        </p>
      </div>
    );
  }

  const stats = useMemo(() => {
    if (historyForSelected.length === 0) return null;
    const values = historyForSelected.map((r) => Number(r.value));
    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      min,
      max,
      avg: sum / values.length,
      count: values.length,
      sum,
      range: max - min,
    };
  }, [historyForSelected]);

  const latestSelected = selectedMetric ? readingsByMetric.get(selectedMetric)?.slice(-1)[0] : undefined;
  const deviceQuality = useMemo(() => overallDeviceQuality(readingsByMetric), [readingsByMetric]);
  const selectedTrend = useMemo(
    () => (selectedMetric ? computeTrend(readingsByMetric.get(selectedMetric) ?? []) : null),
    [selectedMetric, readingsByMetric]
  );

  const battery = batteryTone(device.battery_pct);
  const title = deviceTitleOverride[device.name ?? ""] ?? device.name ?? "Sensor";

  // ── Manual resize (drag the left edge) ──────────────────────────────────
  const MIN_PANEL_WIDTH = 420;
  const MAX_PANEL_WIDTH = 900;
  const DEFAULT_PANEL_WIDTH = 560;
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isDesktop, setIsDesktop] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    function checkDesktop() {
      setIsDesktop(window.innerWidth >= 640);
    }
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const proposed = window.innerWidth - e.clientX;
      const cappedMax = Math.min(MAX_PANEL_WIDTH, window.innerWidth - 80);
      setPanelWidth(Math.min(cappedMax, Math.max(MIN_PANEL_WIDTH, proposed)));
    }
    function onMouseUp() {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resetWidth(e: React.MouseEvent) {
    e.preventDefault();
    setPanelWidth(DEFAULT_PANEL_WIDTH);
  }

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="absolute inset-y-0 right-0 z-[1100] flex w-full flex-col overflow-y-auto bg-white shadow-2xl sm:w-[560px]"
      style={isDesktop ? { width: panelWidth } : undefined}
    >
      {/* Drag handle — grab the left edge to resize the panel */}
      {isDesktop && (
        <div
          onMouseDown={startResize}
          onDoubleClick={resetWidth}
          title="Drag to resize · double-click to reset"
          className="group absolute inset-y-0 left-0 z-[1200] w-2.5 -translate-x-1/2 cursor-col-resize touch-none"
        >
          <div className="mx-auto h-full w-0.5 bg-transparent transition group-hover:bg-blue-400/50 group-active:bg-blue-500" />
          <div className="absolute left-1/2 top-1/2 flex h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full bg-ink/10 opacity-0 transition group-hover:opacity-100">
            <span className="h-1 w-1 rounded-full bg-ink/40" />
            <span className="h-1 w-1 rounded-full bg-ink/40" />
            <span className="h-1 w-1 rounded-full bg-ink/40" />
          </div>
        </div>
      )}
      <div className="flex items-start justify-between px-6 pt-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-blue-600">{title}</h2>
          <div className="mt-1.5 h-0.5 w-10 bg-blue-600" />
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-ink/50 transition hover:bg-mist hover:text-ink"
          aria-label="Close"
        >
          <Icon path={paths.close} className="h-5 w-5" />
        </button>
      </div>

      {/* Sensor reading cards */}
      <div className="px-6 pt-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded bg-blue-600" />
          <h3 className="font-display text-sm font-semibold text-ink">Sensor Readings</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((metric) => {
            const history = readingsByMetric.get(metric) ?? [];
            const latest = history[history.length - 1];
            if (!latest) return null;
            const isSelected = metric === selectedMetric;
            const { status } = evaluateThreshold(Number(latest.value), latest.optimal_min, latest.optimal_max);
            const statusTone =
              status === "critical"
                ? { dot: "bg-red-500", ring: "ring-red-500/30", glow: "shadow-[0_0_0_3px_rgba(239,68,68,0.15)]" }
                : status === "warning"
                  ? { dot: "bg-amber-400", ring: "ring-amber-400/30", glow: "shadow-[0_0_0_3px_rgba(251,191,36,0.15)]" }
                  : { dot: "bg-emerald-500", ring: "ring-emerald-500/30", glow: "shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" };
            const trend = computeTrend(history);
            return (
              <button
                key={metric}
                onClick={() => {
                  setSelectedMetric(metric);
                  setTab("chart");
                }}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                  isSelected
                    ? "border-blue-400 bg-gradient-to-br from-blue-50 to-white ring-2 ring-blue-200"
                    : "border-ink/10 bg-gradient-to-br from-white to-mist/40 hover:border-blue-300"
                }`}
              >
                {/* Decorative corner wash, echoes the metric's status color */}
                <div
                  className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.08] ${statusTone.dot}`}
                />

                <div className="relative flex items-start justify-between">
                  <p className="text-sm font-semibold text-ink">{metricLabel[metric] ?? metric}</p>
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 ring-4 ring-white`}>
                    <Icon path={paths[metricIcon[metric] ?? "gauge"]} className="h-4.5 w-4.5" />
                  </span>
                  <span
                    className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ${statusTone.dot} ${statusTone.glow} ${status === "critical" ? "animate-pulse" : ""}`}
                    title={status === "critical" ? "Outside safe range" : status === "warning" ? "Near threshold" : "Within safe range"}
                  />
                </div>

                <div className="relative mt-3 flex items-baseline gap-2">
                  <p className="text-3xl font-bold tracking-tight text-ink">
                    {Number(latest.value).toFixed(3).replace(/\.?0+$/, "") || latest.value}
                  </p>
                  {trend && trend.direction !== "stable" && (
                    <span
                      className={`flex items-center text-sm font-bold ${trend.direction === "rising" ? "text-blue-600" : "text-red-500"}`}
                      title={`${trend.percentChange >= 0 ? "+" : ""}${trend.percentChange.toFixed(1)}% vs previous reading`}
                    >
                      {trend.direction === "rising" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-ink/40">{latest.unit}</p>
                <p className="mt-1 text-[11px] text-ink/40">
                  {new Date(latest.recorded_at).toLocaleDateString(undefined, { month: "long", day: "2-digit", year: "numeric" })}
                </p>

                <div className="relative mt-3 flex gap-1.5 border-t border-ink/5 pt-3">
                  <span
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${battery.bg} ${battery.text}`}
                  >
                    <Icon path={paths.battery} className="h-3 w-3" />
                    {device.battery_pct != null ? `${device.battery_pct}V` : "—"}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600">
                    <Icon path={paths.sim} className="h-3 w-3" />
                    SIM
                  </span>
                </div>
              </button>
            );
          })}
          {metrics.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-ink/40">No readings for this sensor yet.</p>}
        </div>
      </div>

      {/* History */}
      <div className="mt-6 flex-1 border-t border-ink/10 px-6 py-5">
        {!selectedMetric ? (
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded bg-blue-600" />
            <p className="font-display text-sm font-semibold text-ink">Select a Sensor Card for History</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-4 w-1 rounded bg-blue-600" />
              <h3 className="font-display text-sm font-semibold text-ink">History for: {metricLabel[selectedMetric] ?? selectedMetric}</h3>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {([
                ["all", "All"],
                ["today", "Today"],
                ["1h", "Last 1 Hr"],
                ["12h", "Last 12 Hrs"],
                ["24h", "Last 24 Hrs"],
              ] as [RangeKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`rounded-lg py-2 text-xs font-medium transition ${
                    range === key
                      ? "bg-gradient-to-r from-blue-500 to-blue-700 text-white"
                      : "border border-ink/10 text-ink/70 hover:border-blue-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-ink/10 p-4">
              <p className="mb-3 text-xs font-semibold text-ink">Set Custom Range</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-ink/50">
                  Start Time
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1 w-full rounded-md border border-ink/10 px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="text-xs text-ink/50">
                  End Time
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1 w-full rounded-md border border-ink/10 px-2 py-1.5 text-xs"
                  />
                </label>
              </div>
              <button
                onClick={() => setRange("custom")}
                className="mt-3 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-800 py-2 text-xs font-semibold text-white transition hover:from-indigo-500 hover:to-indigo-700"
              >
                Search Custom Range
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {([
                ["chart", "Chart"],
                ["table", "Table"],
                ["stats", "Data Stats"],
                ["decision", "Decision Support"],
              ] as [TabKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${
                    tab === key
                      ? "bg-gradient-to-r from-blue-500 to-blue-700 text-white"
                      : "border border-ink/10 text-ink/70 hover:border-blue-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {historyForSelected.length === 0 ? (
                <div className="rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-600">
                  No historical data found for {metricLabel[selectedMetric] ?? selectedMetric} in this time range.
                </div>
              ) : tab === "chart" ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    {/* Legend, old-site style: color swatch + "<Sensor> (<unit>)" */}
                    <span className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2 py-1 text-[11px] font-medium text-ink/70">
                      <span className="h-2.5 w-4 rounded-sm bg-blue-500/70" />
                      {title} ({historyForSelected[0]?.unit ?? metricLabel[selectedMetric] ?? selectedMetric})
                    </span>
                    <button
                      onClick={() => setTableSort((s) => (s === "desc" ? "asc" : "desc"))}
                      className="flex items-center gap-1 rounded-lg border border-ink/10 px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-blue-300 hover:text-blue-600"
                    >
                      {tableSort === "desc" ? "Latest → Oldest" : "Oldest → Latest"}
                      <span className="text-[10px]">{tableSort === "desc" ? "▼" : "▲"}</span>
                    </button>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#12303B10" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickMargin={8} minTickGap={24} />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        {/* content={} swaps in the dark old-site-style tooltip instead of
                            recharts' default box */}
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#2563EB", strokeWidth: 1, strokeDasharray: "4 4" }} />
                        {/* dot={false} — no permanent dot on every point. activeDot is the
                            single highlighted circle that appears only on the point being
                            hovered, matching the old site instead of a dot-covered line. */}
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#2563EB"
                          strokeWidth={2}
                          fill="url(#chartFill)"
                          dot={false}
                          activeDot={{ r: 5, fill: "#2563EB", stroke: "#fff", strokeWidth: 2 }}
                          isAnimationActive
                          animationDuration={500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : tab === "table" ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-ink/60">
                      Show
                      <select
                        value={tablePageSize}
                        onChange={(e) => setTablePageSize(Number(e.target.value))}
                        className="rounded-lg border border-ink/10 px-2 py-1 text-xs"
                      >
                        {[10, 25, 50, 100].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      entries
                    </label>
                    <input
                      value={tableQuery}
                      onChange={(e) => setTableQuery(e.target.value)}
                      placeholder="Search by time or value..."
                      className="w-full max-w-[220px] rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs placeholder:text-ink/30 focus:border-blue-400 focus:outline-none"
                    />
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-ink/10 shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                          <th className="px-4 py-3 font-semibold">
                            <button
                              onClick={() => setTableSort((s) => (s === "desc" ? "asc" : "desc"))}
                              className="flex items-center gap-1 hover:text-blue-100"
                            >
                              Timestamp
                              <span className="text-[10px]">{tableSort === "desc" ? "▼" : "▲"}</span>
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tablePageRows.map((r, i) => (
                          <tr
                            key={r.id}
                            className={`border-b border-ink/5 last:border-0 transition hover:bg-blue-50 ${i % 2 === 1 ? "bg-mist/40" : "bg-white"}`}
                          >
                            <td className="px-4 py-2.5 text-ink/70">{new Date(r.recorded_at).toLocaleString()}</td>
                            <td className="px-4 py-2.5 font-mono font-semibold text-ink">
                              {r.value} <span className="font-sans font-normal text-ink/40">{r.unit}</span>
                            </td>
                          </tr>
                        ))}
                        {tablePageRows.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-4 py-6 text-center text-ink/40">
                              No matching rows.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div className="flex items-center justify-between border-t border-ink/10 bg-mist/30 px-4 py-2.5 text-xs text-ink/60">
                      <span>
                        Showing {filteredTableRows.length === 0 ? 0 : (tablePage - 1) * tablePageSize + 1} to{" "}
                        {Math.min(tablePage * tablePageSize, filteredTableRows.length)} of {filteredTableRows.length} entries
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={tablePage <= 1}
                          onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                          className="rounded-lg border border-ink/10 px-2.5 py-1 font-medium disabled:opacity-40"
                        >
                          « Previous
                        </button>
                        <span>
                          {tablePage} of {tableTotalPages}
                        </span>
                        <button
                          disabled={tablePage >= tableTotalPages}
                          onClick={() => setTablePage((p) => Math.min(tableTotalPages, p + 1))}
                          className="rounded-lg border border-ink/10 px-2.5 py-1 font-medium disabled:opacity-40"
                        >
                          Next »
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : tab === "stats" && stats ? (
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { label: "Maximum Value", value: `${stats.max}`, icon: "gauge" as const, tone: "from-red-500/10 to-red-500/0 text-red-600" },
                      { label: "Minimum Value", value: `${stats.min}`, icon: "waves" as const, tone: "from-blue-500/10 to-blue-500/0 text-blue-600" },
                      { label: "Average Value", value: stats.avg.toFixed(2), icon: "flask" as const, tone: "from-violet-500/10 to-violet-500/0 text-violet-600" },
                      { label: "Data Points", value: `${stats.count}`, icon: "bolt" as const, tone: "from-amber-500/10 to-amber-500/0 text-amber-600" },
                      { label: "Cumulative Value", value: stats.sum.toFixed(2), icon: "droplet" as const, tone: "from-emerald-500/10 to-emerald-500/0 text-emerald-600" },
                      { label: "Difference (Range)", value: stats.range.toFixed(2), icon: "thermometer" as const, tone: "from-sky-500/10 to-sky-500/0 text-sky-600" },
                    ] as const
                  ).map((tile) => (
                    <div
                      key={tile.label}
                      className={`rounded-2xl border border-ink/5 bg-gradient-to-br p-4 shadow-sm ${tile.tone}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon path={paths[tile.icon]} className="h-4 w-4" />
                        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{tile.label}</p>
                      </div>
                      <p className="mt-2 font-mono text-2xl font-bold text-ink">
                        {tile.value} <span className="text-sm font-sans font-normal text-ink/40">{latestSelected?.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : tab === "decision" && latestSelected ? (
                (() => {
                  const value = Number(latestSelected.value);
                  const { status, message } = evaluateThreshold(value, latestSelected.optimal_min, latestSelected.optimal_max);
                  const score = computeQualityScore(value, latestSelected.optimal_min, latestSelected.optimal_max);
                  const recommendation = getRecommendation({
                    metric: selectedMetric!,
                    groupType: device.group_type,
                    status,
                    trend: selectedTrend,
                  });
                  const isQualityDevice = device.group_type === "groundwater_well" || device.group_type === "groundwater_reservoir";

                  // Leak Detection Analysis — matches the old site's DSS section of the
                  // same name. assessPressure wants newest-first history; readingsByMetric
                  // is stored oldest-first (buildRows/queries elsewhere append in that
                  // order), so reverse before passing. Only meaningful for pressure. Uses
                  // the REAL thresholds ported from PerformDSSAnalysis.py (see
                  // lib/leakDetection.ts), not an approximation.
                  const leakAssessment =
                    selectedMetric === "pressure"
                      ? assessPressure(
                          device.status === "online",
                          [...(readingsByMetric.get(selectedMetric) ?? [])]
                            .reverse()
                            .map((r) => ({ value: Number(r.value), recorded_at: r.recorded_at }))
                        )
                      : null;

                  // Rate of change over the selected time range — same idea as the old
                  // site's "Current Flow Rate" line (it's actually a pressure-change
                  // rate, not real flow — that's what the old system itself computes
                  // and labels, so this replicates it honestly rather than inventing a
                  // different real "flow" figure we have no sensor for).
                  const rateOfChange =
                    historyForSelected.length >= 2
                      ? (() => {
                          const first = historyForSelected[0];
                          const last = historyForSelected[historyForSelected.length - 1];
                          const hours = (new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 3_600_000;
                          if (hours <= 0) return null;
                          return (Number(last.value) - Number(first.value)) / hours;
                        })()
                      : null;

                  const statusTone =
                    status === "critical"
                      ? { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" }
                      : status === "warning"
                        ? { bg: "bg-amber-50", text: "text-amber-600" as string, dot: "bg-amber-400" }
                        : { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" };

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="h-4 w-1 rounded bg-blue-600" />
                        <h4 className="font-display text-sm font-semibold text-ink">Decision Support Analysis</h4>
                      </div>

                      {/* Device operational status */}
                      <div className="rounded-xl border border-ink/10 p-4">
                        <p className="mb-2 text-xs font-semibold text-ink/60">Device Status</p>
                        <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${device.status === "online" ? "bg-emerald-50" : "bg-red-50"}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${device.status === "online" ? "bg-emerald-500" : "bg-red-500"}`} />
                          <div>
                            <p className={`text-sm font-semibold uppercase tracking-wide ${device.status === "online" ? "text-emerald-600" : "text-red-600"}`}>
                              {device.status}
                            </p>
                            <p className="text-xs text-ink/50">
                              {device.status === "online" ? "Reporting normally" : "Not currently reporting — treat recent readings as stale"}
                            </p>
                          </div>
                        </div>
                        {device.last_update && (
                          <p className="mt-2 text-[11px] text-ink/40">
                            Last update: {new Date(device.last_update).toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Leak Detection Analysis — pressure sensors only. Real 5-status
                          system ported from PerformDSSAnalysis.py: Green/Yellow/Orange/
                          Red/Purple map to normal/low_pressure/critical_low/sudden_drop/
                          no_data (plus offline/gray for a disconnected sensor). */}
                      {leakAssessment && (
                        <div className="rounded-xl border border-ink/10 p-4">
                          <p className="mb-2 text-xs font-semibold text-ink/60">Leak Detection Analysis</p>
                          <div
                            className={`rounded-lg px-3 py-2.5 ${
                              {
                                sudden_drop: "bg-red-50",
                                critical_low: "bg-orange-50",
                                low_pressure: "bg-amber-50",
                                normal: "bg-emerald-50",
                                no_data: "bg-purple-50",
                                offline: "bg-mist",
                              }[leakAssessment.status]
                            }`}
                          >
                            <p
                              className={`text-sm font-semibold ${
                                {
                                  sudden_drop: "text-red-600",
                                  critical_low: "text-orange-600",
                                  low_pressure: "text-amber-600",
                                  normal: "text-emerald-600",
                                  no_data: "text-purple-600",
                                  offline: "text-ink/50",
                                }[leakAssessment.status]
                              }`}
                            >
                              {
                                {
                                  sudden_drop: "🔴 Sudden Drop — Possible Leak",
                                  critical_low: "🟠 Critical Low Pressure",
                                  low_pressure: "🟡 Low Pressure Warning",
                                  normal: "✅ Normal — No Leak Signature",
                                  no_data: "🟣 No Valid Data",
                                  offline: "Sensor Offline",
                                }[leakAssessment.status]
                              }
                              {leakAssessment.dropAmount != null && (
                                <span className="ml-1 font-normal text-ink/40">
                                  (fell {leakAssessment.dropAmount.toFixed(2)}m in the last hour)
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-ink/50">{leakAssessment.message}</p>
                          </div>
                        </div>
                      )}

                      {/* Water Quality Assessment — device-wide, only for groundwater sensors */}
                      {isQualityDevice && (
                        <div className="rounded-xl border border-ink/10 p-4">
                          <p className="mb-2 text-xs font-semibold text-ink/60">Water Quality Assessment</p>
                          <div className="rounded-lg bg-blue-50 px-3 py-2.5">
                            <p className="text-sm font-medium text-ink">
                              Overall Quality: <span className="font-semibold">{deviceQuality.label}</span>
                              {deviceQuality.score != null && <span className="text-ink/50"> ({deviceQuality.score}/100)</span>}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink/40">
                              {deviceQuality.metricsUsed > 0
                                ? `Based on ${deviceQuality.metricsUsed} quality metric${deviceQuality.metricsUsed === 1 ? "" : "s"} (pH, turbidity, TDS, conductivity, salinity)`
                                : "No quality metrics with a defined safe range reported yet"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Alert Summary */}
                      <div className="rounded-xl border border-ink/10 p-4">
                        <p className="mb-2 text-xs font-semibold text-ink/60">Alert Summary</p>
                        <div className={`rounded-lg border-l-4 px-3 py-2.5 text-sm ${statusTone.bg} ${statusTone.text}`} style={{ borderColor: "currentColor" }}>
                          {status === "normal" ? "No alerts — reading is within its safe range." : message}
                        </div>
                      </div>

                      {/* Trend Analysis */}
                      <div className="rounded-xl border border-ink/10 p-4">
                        <p className="mb-2 text-xs font-semibold text-ink/60">Trend Analysis — {metricLabel[selectedMetric!] ?? selectedMetric}</p>
                        {selectedTrend ? (
                          <>
                            <p className="text-sm font-medium text-ink">
                              Current Trend:{" "}
                              <span className={selectedTrend.direction === "falling" ? "text-red-500" : selectedTrend.direction === "rising" ? "text-blue-600" : "text-emerald-600"}>
                                {selectedTrend.direction}
                              </span>{" "}
                              <span className="text-ink/40">({selectedTrend.percentChange >= 0 ? "+" : ""}{selectedTrend.percentChange.toFixed(1)}%)</span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink/40">
                              Based on {readingsByMetric.get(selectedMetric!)?.length ?? 0} data points
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-ink/50">Not enough readings yet to determine a trend (need at least 2).</p>
                        )}
                      </div>

                      {/* Recommendations */}
                      <div className="rounded-xl border border-ink/10 p-4">
                        <p className="mb-2 text-xs font-semibold text-ink/60">Recommendations</p>
                        <ul className="space-y-1.5 text-sm text-ink/80">
                          <li className="flex gap-2">
                            <span>{status === "normal" ? "✅" : status === "critical" ? "🔴" : "⚠️"}</span>
                            <span>{recommendation}</span>
                          </li>
                          <li className="flex gap-2 text-ink/50">
                            <span>•</span>
                            <span>Continue regular monitoring schedule.</span>
                          </li>
                          {selectedTrend?.direction === "falling" && (
                            <li className="flex gap-2 text-amber-600">
                              <span>📉</span>
                              <span>Monitor trend closely — system showing decline.</span>
                            </li>
                          )}
                          {rateOfChange != null && (
                            <li className="flex gap-2 text-blue-600">
                              <span>💧</span>
                              <span>
                                Current Flow Rate: {rateOfChange >= 0 ? "+" : ""}
                                {rateOfChange.toFixed(2)} {latestSelected.unit}/hour
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>

                      {/* Quality Score for the selected metric specifically */}
                      {score != null && (
                        <div className="rounded-xl border border-ink/10 p-4">
                          <p className="mb-2 text-xs font-semibold text-ink/60">{metricLabel[selectedMetric!] ?? selectedMetric} Quality Score</p>
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
                              <div
                                className={`h-full rounded-full ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-red-500"}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className="font-mono text-sm font-semibold text-ink">{score}/100</span>
                          </div>
                        </div>
                      )}

                      {/* Statistical Insights — reuses the same `stats` already computed for the Data Stats tab */}
                      {stats && (
                        <div className="rounded-xl border border-ink/10 p-4">
                          <p className="mb-2 text-xs font-semibold text-ink/60">Statistical Insights</p>
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <p className="font-mono text-sm font-semibold text-ink">{Number(latestSelected.value).toFixed(2)}</p>
                              <p className="text-ink/40">Latest</p>
                            </div>
                            <div>
                              <p className="font-mono text-sm font-semibold text-ink">{stats.avg.toFixed(2)}</p>
                              <p className="text-ink/40">Avg</p>
                            </div>
                            <div>
                              <p className="font-mono text-sm font-semibold text-ink">{stats.min.toFixed(2)} - {stats.max.toFixed(2)}</p>
                              <p className="text-ink/40">Range</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : null}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}