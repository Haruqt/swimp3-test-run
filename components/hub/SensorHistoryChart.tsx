"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export interface HistoryPoint {
  recorded_at: string;
  value: number;
}

type RangeKey = "24h" | "7d" | "30d" | "all";

const RANGE_MS: Record<Exclude<RangeKey, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function SensorHistoryChart({ points, unit }: { points: HistoryPoint[]; unit: string }) {
  const [range, setRange] = useState<RangeKey>("7d");
  const [view, setView] = useState<"chart" | "table">("chart");

  const filtered = useMemo(() => {
    if (range === "all") return points;
    const cutoff = Date.now() - RANGE_MS[range];
    return points.filter((p) => new Date(p.recorded_at).getTime() >= cutoff);
  }, [points, range]);

  const chartData = filtered.map((p) => ({
    time: new Date(p.recorded_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    value: p.value,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["24h", "7d", "30d", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                range === r
                  ? "rounded-lg bg-river px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-lg bg-white/5 px-3 py-1.5 text-xs text-mist/60 hover:bg-white/10"
              }
            >
              {r === "24h" ? "Last 24 Hours" : r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "All Time"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("chart")}
            className={view === "chart" ? "rounded-lg bg-white/10 px-3 py-1.5 text-xs text-mist" : "rounded-lg px-3 py-1.5 text-xs text-mist/50"}
          >
            Chart
          </button>
          <button
            onClick={() => setView("table")}
            className={view === "table" ? "rounded-lg bg-white/10 px-3 py-1.5 text-xs text-mist" : "rounded-lg px-3 py-1.5 text-xs text-mist/50"}
          >
            Table
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-mist/40">No readings found in this time range.</p>
      ) : view === "chart" ? (
        <div className="mt-6 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} unit={unit ? ` ${unit}` : ""} />
              <Tooltip contentStyle={{ background: "#1a2530", border: "none", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#5aa9e6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-6 max-h-96 overflow-y-auto rounded-xl bg-white/5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-mist/40">
                <th className="px-4 py-2">Timestamp</th>
                <th className="px-4 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice()
                .reverse()
                .map((p, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2 text-mist/60">{new Date(p.recorded_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-mist">
                      {p.value} {unit}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}