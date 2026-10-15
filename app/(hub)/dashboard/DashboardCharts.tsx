"use client";

// components/dashboard/DashboardCharts.tsx
//
// Recharts needs to run client-side, so these small wrapper components pull
// that concern out of the (server) dashboard page. Matches the live site's
// 4 chart types: two quality-distribution donuts, a pressure/flow bar
// chart, and an online/offline connectivity pie.

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
type QualityDistribution = {
  optimal: number;
  warning: number;
  critical: number;
  offline: number;
};

// Matches this project's actual Tailwind theme colors (tailwind.config.ts)
// rather than generic chart-library defaults.
const QUALITY_COLORS = {
  optimal: "#5C7A5C", // moss
  warning: "#f59e0b", // amber-500, matches existing amber-400/500 usage elsewhere in the dashboard
  critical: "#C1622D", // clay
  offline: "#6b7280", // neutral gray — no dedicated "offline" token in the theme
};

export function QualityDonut({ distribution, label }: { distribution: QualityDistribution; label: string }) {
  const data = [
    { name: "Optimal", value: distribution.optimal, color: QUALITY_COLORS.optimal },
    { name: "Warning", value: distribution.warning, color: QUALITY_COLORS.warning },
    { name: "Critical", value: distribution.critical, color: QUALITY_COLORS.critical },
    { name: "Offline", value: distribution.offline, color: QUALITY_COLORS.offline },
  ];
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-mist/40">
        No {label} readings yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} stroke="none" />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          height={32}
          formatter={(value) => <span className="text-xs text-mist/70">{value}</span>}
        />
        {/* itemStyle explicitly set to white — without it Recharts colors
            each line by that series' own fill color, which on a dark
            #191c24 box made "Critical: 2" etc unreadably dim/low-contrast.
            border+boxShadow also added so the box itself stands out from
            the page background it's floating over. */}
        <Tooltip
          contentStyle={{
            background: "#191c24",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
          labelStyle={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ color: "#fff" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({
  data,
  color,
  unit,
  emptyMessage,
}: {
  data: { label: string; value: number }[];
  color: string;
  unit: string;
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-mist/40">{emptyMessage}</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <XAxis dataKey="label" tick={{ fill: "#6c7293", fontSize: 11 }} axisLine={{ stroke: "#2a2d38" }} />
        <YAxis
          tick={{ fill: "#6c7293", fontSize: 11 }}
          axisLine={{ stroke: "#2a2d38" }}
          label={{ value: unit, angle: -90, position: "insideLeft", fill: "#6c7293", fontSize: 11 }}
        />
        <Tooltip
          // cursor: Recharts' BarChart default hover cursor is a light
          // gray/white rectangle drawn behind the whole bar column — that's
          // the "white shadow" that looked like an animation glitch on
          // hover. Replacing it with a faint tint of the bar's own color
          // instead of the default gray keeps the hover feedback without
          // the odd flash.
          cursor={{ fill: "rgba(0,144,231,0.08)" }}
          contentStyle={{
            background: "#191c24",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
          labelStyle={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ color: "#fff" }}
          formatter={(value: number) => [`${value} ${unit}`, "Value"]}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ConnectivityPie({ online, offline }: { online: number; offline: number }) {
  const total = online + offline;
  if (total === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-mist/40">
        No devices registered yet.
      </div>
    );
  }
  const data = [
    { name: "Online", value: online, color: "#5C7A5C" }, // moss
    { name: "Offline", value: offline, color: "#C1622D" }, // clay
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={90}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} stroke="none" />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          height={32}
          formatter={(value) => <span className="text-xs text-mist/70">{value}</span>}
        />
        <Tooltip
          contentStyle={{
            background: "#191c24",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
          labelStyle={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ color: "#fff" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}