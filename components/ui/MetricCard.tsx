import { StatusDroplet } from "./StatusDroplet";
import type { DeviceStatus } from "@/lib/types";

export function MetricCard({
  label,
  value,
  unit,
  status,
  lastUpdated,
  optimalRange,
}: {
  label: string;
  value: number | string;
  unit: string;
  status: DeviceStatus;
  lastUpdated?: string;
  optimalRange?: string;
}) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5">
      <div className="flex items-start justify-between">
        <span className="font-mono text-3xl font-medium text-ink">
          {value}
          <span className="ml-1 text-base text-ink/50">{unit}</span>
        </span>
        <StatusDroplet status={status} showLabel={false} size="md" />
      </div>
      <p className="mt-2 text-sm text-ink/70">{label}</p>
      {lastUpdated && (
        <p className="mt-3 font-mono text-xs text-ink/40">Updated {lastUpdated}</p>
      )}
      {optimalRange && (
        <p className="mt-1 font-mono text-xs text-river">Optimal: {optimalRange}</p>
      )}
    </div>
  );
}
