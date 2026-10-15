// Shared across all "Device Management" pages so they look consistent —
// previously only the Groundwater page had this gradient style, while
// Pressure and Smart Water Meter used plain flat cards. Icons match the
// old site's icon-heavy stat cards.

import type { ReactNode } from "react";

export function SummaryCard({
  label,
  value,
  gradient,
  icon,
}: {
  label: string;
  value: number | string;
  gradient: string;
  icon?: ReactNode;
}) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${gradient} p-5 text-white`}>
      {icon && <div className="mb-2 opacity-90">{icon}</div>}
      <p className="font-mono text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
    </div>
  );
}

// A small, consistent icon set — plain inline SVGs rather than a new
// dependency, matching how the sidebar icons were done earlier.
export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}
export function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20v-4M10 20v-8M16 20V8M22 20V4" strokeLinecap="round" />
    </svg>
  );
}
export function ChipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" strokeLinecap="round" />
    </svg>
  );
}
export function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13z" strokeLinejoin="round" />
    </svg>
  );
}
export function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21a9 9 0 1 1 9-9" strokeLinecap="round" />
      <path d="M12 12l4-3" strokeLinecap="round" />
    </svg>
  );
}