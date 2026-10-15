import clsx from "clsx";
import type { Alert } from "@/lib/types";

/**
 * Redesigned (2026-09-22) to match the old site's "System Maintenance
 * Recommendations" cards, which the rebuild's plain small card lost —
 * user feedback: the old ones actually read as "something is wrong",
 * the new ones read as flat/generic.
 *
 * Old site shape, reproduced here:
 *   - Thick colored left border + a matching top-right priority pill
 *     ("HIGH" / "MEDIUM") — coarser than the raw severity value.
 *   - Bold title, plain description line.
 *   - "Root Cause:" bold inline label.
 *   - "Recommended Actions:" bold label over a bullet list.
 *   - Bottom row: "Estimated: X" on the left, the raw severity word
 *     (e.g. "immediate") in colored italic on the right — this is
 *     DIFFERENT from the top badge on purpose: the top badge is a coarser
 *     priority tier, the bottom word is the literal severity value, same
 *     as the old site showed both at once.
 */

const priorityTier: Record<Alert["severity"], "HIGH" | "MEDIUM"> = {
  emergency: "HIGH",
  immediate: "HIGH",
  high: "HIGH",
  medium: "MEDIUM",
};

const severityStyles: Record<
  Alert["severity"],
  { border: string; badge: string; glow: string; urgency: string }
> = {
  emergency: {
    border: "border-l-red-500",
    badge: "bg-red-500 text-white",
    glow: "shadow-[0_0_0_1px_rgba(239,68,68,0.15)]",
    urgency: "text-red-400",
  },
  immediate: {
    border: "border-l-amber-500",
    badge: "bg-amber-500 text-ink",
    glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.15)]",
    urgency: "text-amber-400",
  },
  high: {
    border: "border-l-amber-500",
    badge: "bg-amber-500 text-ink",
    glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.15)]",
    urgency: "text-amber-400",
  },
  medium: {
    border: "border-l-ink/30",
    badge: "bg-white/10 text-mist",
    glow: "",
    urgency: "text-mist/50",
  },
};

export function AlertCard({ alert }: { alert: Alert }) {
  const style = severityStyles[alert.severity];
  const tier = priorityTier[alert.severity];

  return (
    <div
      className={clsx(
        "rounded-xl border-l-[5px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5",
        style.border,
        style.glow
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-mist">{alert.title}</h3>
        <span
          className={clsx(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
            style.badge
          )}
        >
          {tier}
        </span>
      </div>

      <p className="mt-1.5 text-sm text-mist/70">{alert.description}</p>

      {alert.root_cause && (
        <p className="mt-3 text-xs text-mist/60">
          <span className="font-semibold text-mist">Root Cause:</span> {alert.root_cause}
        </p>
      )}

      {alert.recommended_actions && alert.recommended_actions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-mist">Recommended Actions:</p>
          <ul className="mt-1.5 space-y-1 text-xs text-mist/70">
            {alert.recommended_actions.map((action) => (
              <li key={action} className="flex gap-2">
                <span className="text-mist/30">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        {alert.estimated_time ? (
          <p className="font-mono text-xs text-river-light">Estimated: {alert.estimated_time}</p>
        ) : (
          <span />
        )}
        <p className={clsx("text-xs font-semibold italic", style.urgency)}>{alert.severity}</p>
      </div>
    </div>
  );
}