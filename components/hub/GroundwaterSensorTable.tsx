"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResizableTable, type ColumnDef } from "./ResizableTable";

export interface SensorRow {
  metric: string;
  sensorName: string;
  unit: string;
  value: number;
  status: "optimal" | "warning" | "critical" | "emergency" | "unknown";
  deviceStatus: string;
  lastUpdate: string; // ISO string, or "" if never synced
  group: "well" | "reservoir";
}

function statusBadgeClass(status: SensorRow["status"]) {
  if (status === "optimal") return "bg-moss/20 text-moss-light";
  if (status === "warning") return "bg-amber-500/20 text-amber-400";
  if (status === "critical" || status === "emergency") return "bg-clay/20 text-clay-light";
  return "bg-white/10 text-mist/40";
}

function connectivityBadgeClass(deviceStatus: string) {
  if (deviceStatus === "online") return "bg-moss/20 text-moss-light";
  if (deviceStatus === "stale") return "bg-amber-500/20 text-amber-400";
  return "bg-clay/20 text-clay-light";
}

function toCsv(rows: SensorRow[]): string {
  const header = ["Sensor Name", "Unit", "Last Update", "Value", "Reading Status", "Connectivity"];
  const lines = rows.map((r) =>
    [
      r.sensorName,
      r.unit,
      r.lastUpdate ? new Date(r.lastUpdate).toLocaleString() : "No data",
      r.value,
      r.status,
      r.deviceStatus,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export function GroundwaterSensorTable({ wellRows, reservoirRows }: { wellRows: SensorRow[]; reservoirRows: SensorRow[] }) {
  const [tab, setTab] = useState<"well" | "reservoir" | "all">("well");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const allRows = useMemo(() => [...wellRows, ...reservoirRows], [wellRows, reservoirRows]);
  const activeRows = tab === "well" ? wellRows : tab === "reservoir" ? reservoirRows : allRows;
  const filteredRows = query.trim()
    ? activeRows.filter((r) => r.sensorName.toLowerCase().includes(query.trim().toLowerCase()))
    : activeRows;

  useEffect(() => {
    setPage(1);
  }, [tab, query, pageSize]);

  function handleExport() {
    const csv = toCsv(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `groundwater-sensors-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Column headers carry the same small icon-before-label treatment as the
  // Pressure/Smart-Meter tables (SensorMetricTable) — previously this table
  // was the one place missing them, which is what looked inconsistent.
  const columns: ColumnDef<SensorRow>[] = [
    { key: "name", header: "📟 Sensor Name", width: 200, render: (r) => <span className="text-mist">{r.sensorName}</span> },
    { key: "unit", header: "📏 Unit", width: 90, render: (r) => <span className="text-mist/60">{r.unit || "—"}</span> },
    {
      key: "lastUpdate",
      header: "🕐 Last Update",
      width: 190,
      render: (r) => (
        <span className="text-mist/50">{r.lastUpdate ? new Date(r.lastUpdate).toLocaleString() : "No data"}</span>
      ),
    },
    {
      key: "value",
      header: "📊 Value",
      width: 140,
      render: (r) => (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(r.status)}`}>
          {r.value.toFixed(2)} {r.unit}
        </span>
      ),
    },
    {
      key: "status",
      header: "🔵 Reading Status",
      width: 150,
      render: (r) => (
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${statusBadgeClass(r.status)}`}>
          {r.status}
        </span>
      ),
    },
    {
      key: "connectivity",
      header: "📶 Connectivity",
      width: 140,
      render: (r) => (
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${connectivityBadgeClass(r.deviceStatus)}`}>
          {r.deviceStatus}
        </span>
      ),
    },
    {
      key: "actions",
      header: "⚙️ Actions",
      width: 140,
      render: () => (
        <Link href="/dashboard" className="text-xs text-river-light hover:underline">
          View on Dashboard
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "well", label: "Groundwater Monitoring Well" },
            { key: "reservoir", label: "Groundwater Reservoir" },
            { key: "all", label: "All Sensors Combined" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-lg bg-river px-4 py-2 text-sm font-medium text-white"
                : "rounded-lg bg-white/5 px-4 py-2 text-sm text-mist/60 hover:bg-white/10 hover:text-mist"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-mist/60">
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
          entries
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sensors..."
          className="w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist placeholder:text-mist/40 focus:border-river focus:outline-none"
        />
        <button
          onClick={handleExport}
          className="ml-auto rounded-lg bg-moss px-4 py-2 text-sm font-medium text-white hover:bg-moss-light"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
        <ResizableTable
          columns={columns}
          rows={filteredRows}
          rowKey={(r) => `${r.group}-${r.metric}`}
          emptyMessage="No sensors match your search."
          pageSize={pageSize}
          page={page}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}