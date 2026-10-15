"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ResizableTable, type ColumnDef } from "./ResizableTable";
import { DeviceLocationMapClient } from "@/components/map/DeviceLocationMapClient";
import type { Device, SensorReading } from "@/lib/types";

/**
 * The full device detail page — this is what the old site's blue "Check"
 * button opened (a whole page: Basic Information card, a date-range
 * table with pagination, a map pin, and a graph), which the rebuild
 * previously only had as a slide-over panel with no map and fewer fields
 * (no Rssi/Power). This component is that page's client-interactive half;
 * the server page fetches the device + reading rows and hands them here.
 */

function toCsv(rows: SensorReading[], device: Device): string {
  const header = ["DeviceID", "DeviceName", "Value", "Unit", "Date and Time"];
  const lines = rows.map((r) =>
    [device.external_device_id, device.name ?? "", r.value, r.unit, new Date(r.recorded_at).toLocaleString()]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function ChartTooltip({
  active,
  payload,
  label,
  deviceName,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  deviceName: string;
  unit: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-white/90">
        <span className="h-2 w-2 rounded-sm bg-blue-400" />
        {deviceName}: {payload[0].value} {unit}
      </p>
    </div>
  );
}

export function DeviceDetailView({
  device,
  readings,
  metric,
  sensorName,
}: {
  device: Device;
  readings: SensorReading[]; // newest-first
  metric: string;
  sensorName: string;
}) {
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const filteredReadings = useMemo(() => {
    if (!appliedStart && !appliedEnd) return readings;
    const startMs = appliedStart ? new Date(appliedStart).getTime() : -Infinity;
    const endMs = appliedEnd ? new Date(appliedEnd).getTime() : Infinity;
    return readings.filter((r) => {
      const t = new Date(r.recorded_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [readings, appliedStart, appliedEnd]);

  useEffect(() => {
    setPage(1);
  }, [appliedStart, appliedEnd, pageSize]);

  const latest = readings[0];
  const unit = latest?.unit ?? "";

  function handleSearch() {
    setAppliedStart(customStart);
    setAppliedEnd(customEnd);
  }

  function handleExport() {
    const csv = toCsv(filteredReadings, device);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${device.external_device_id}-${metric}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<SensorReading>[] = [
    { key: "deviceId", header: "🔖 Device ID", width: 140, render: () => <span className="text-mist/70">{device.external_device_id}</span> },
    { key: "deviceName", header: "🏷️ Device Name", width: 200, render: () => <span className="text-mist">{sensorName}</span> },
    {
      key: "value",
      header: `📊 Value (${unit})`,
      width: 130,
      render: (r) => <span className="font-mono font-semibold text-mist">{r.value}</span>,
    },
    {
      key: "time",
      header: "🕐 Date and Time",
      width: 190,
      render: (r) => <span className="text-mist/60">{new Date(r.recorded_at).toLocaleString()}</span>,
    },
  ];

  // Oldest → latest for the graph, same as the sensor detail panel's
  // default (reads left-to-right chronologically instead of needing a flip).
  const chartData = [...filteredReadings]
    .reverse()
    .map((r) => ({
      time: new Date(r.recorded_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      value: Number(r.value),
    }));

  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-mist">{sensorName} — Device Management</h1>

      {/* Basic Information */}
      <div className="mt-6 rounded-xl bg-white/5 p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded bg-river" />
          <h2 className="text-sm font-semibold text-mist">Basic Information</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <p className="text-sm text-mist/70">
            <span className="font-semibold text-mist">Device Id:</span> {device.external_device_id}
          </p>
          <p className="text-sm text-mist/70">
            <span className="font-semibold text-mist">Receive Time:</span>{" "}
            {device.last_update ? new Date(device.last_update).toLocaleString() : "No data"}
          </p>
          <p className="text-sm text-mist/70">
            <span className="font-semibold text-mist">Device Name:</span> {sensorName}
          </p>
          <p className="text-sm text-mist/70">
            <span className="font-semibold text-mist">Current Value:</span>{" "}
            {latest ? `${latest.value} ${latest.unit}` : "No data yet"}
          </p>
          <p className="text-sm text-mist/70">
            <span className="font-semibold text-mist">Network Type:</span> {device.network_type ?? "—"}
          </p>
          {/* Rssi/Power only render when a sync route has actually
              populated them — showing "—" instead of a fabricated number
              for devices/metrics that don't report it. */}
          {device.rssi != null && (
            <p className="text-sm text-mist/70">
              <span className="font-semibold text-mist">Rssi:</span> {device.rssi}
            </p>
          )}
          <p className="text-sm text-mist/70">
            <span className="font-semibold text-mist">Status:</span>{" "}
            <span className={device.status === "online" ? "text-emerald-400" : "text-clay-light"}>{device.status}</span>
          </p>
          {device.battery_pct != null && (
            <p className="text-sm text-mist/70">
              <span className="font-semibold text-mist">Power:</span> {device.battery_pct}
              {metric === "pressure" ? "V" : "%"}
            </p>
          )}
        </div>
      </div>

      {/* Date range + export */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl bg-white/5 p-6">
        <label className="text-xs text-mist/60">
          Start Date and Time:
          <input
            type="datetime-local"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-mist"
          />
        </label>
        <label className="text-xs text-mist/60">
          End Date and Time:
          <input
            type="datetime-local"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-mist"
          />
        </label>
        <button onClick={handleSearch} className="rounded-lg bg-river px-4 py-2 text-sm font-semibold text-white hover:bg-river-light">
          Search
        </button>
        <button onClick={handleExport} className="ml-auto rounded-lg bg-moss px-4 py-2 text-sm font-medium text-white hover:bg-moss-light">
          ⬇ Export CSV
        </button>
      </div>

      {/* Readings table */}
      <div className="mt-6">
        <label className="mb-2 flex items-center gap-2 text-xs text-mist/60">
          Show
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-mist"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          entries per page
        </label>
        <div className="overflow-hidden rounded-xl border border-white/5">
          <ResizableTable
            columns={columns}
            rows={filteredReadings}
            rowKey={(r) => r.id}
            emptyMessage="No readings in this range."
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Map + Graph */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-4 w-1 rounded bg-river" />
            <h2 className="text-sm font-semibold text-mist">Device Location</h2>
          </div>
          <div className="h-72 overflow-hidden rounded-lg">
            {device.latitude != null && device.longitude != null ? (
              <DeviceLocationMapClient latitude={device.latitude} longitude={device.longitude} label={sensorName} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-mist/40">
                No coordinates set for this device yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-4 w-1 rounded bg-river" />
            <h2 className="text-sm font-semibold text-mist">Graph</h2>
          </div>
          <div className="h-72">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-mist/40">No data to plot.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="deviceDetailFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6c7293" }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: "#6c7293" }} width={36} />
                  <Tooltip content={<ChartTooltip deviceName={sensorName} unit={unit} />} cursor={{ stroke: "#2563EB", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} fill="url(#deviceDetailFill)" dot={false} activeDot={{ r: 5, fill: "#2563EB", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}