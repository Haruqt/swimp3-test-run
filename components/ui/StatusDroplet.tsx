import clsx from "clsx";
import type { DeviceStatus } from "@/lib/types";

const statusConfig: Record<DeviceStatus, { color: string; label: string }> = {
  online: { color: "bg-moss", label: "Online" },
  offline: { color: "bg-clay", label: "Offline" },
  stale: { color: "bg-clay-light", label: "Stale data" },
};

export function StatusDroplet({
  status,
  showLabel = true,
  size = "sm",
}: {
  status: DeviceStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const { color, label } = statusConfig[status];
  const dims = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={clsx(dims, color, "rounded-droplet rotate-[135deg]")}
        aria-hidden
      />
      {showLabel && (
        <span className="font-mono text-xs uppercase tracking-wide text-ink/70">
          {label}
        </span>
      )}
    </span>
  );
}
