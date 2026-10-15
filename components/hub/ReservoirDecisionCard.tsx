import Link from "next/link";
import clsx from "clsx";
import type { ReservoirStatus } from "@/lib/reservoirStatus";

export function riskClass(level: string) {
  const l = level.toUpperCase();
  if (l === "CRITICAL") return "bg-clay text-white";
  if (l === "HIGH") return "bg-orange-500 text-white";
  if (l === "ELEVATED") return "bg-amber-400 text-black";
  if (l === "LOW") return "bg-emerald-500 text-white";
  return "bg-white/10 text-mist/70";
}

export function ReservoirDecisionCard({ status, compact = false }: { status: ReservoirStatus; compact?: boolean }) {
  const h = status.headline;
  return (
    <div className="rounded-xl bg-white/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-mist">Reservoir Prediction &amp; Decision</h3>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-mist/60">
          {h.source === "MIKE" ? "Source: MIKE Operations" : "Source: site analysis (MIKE not reporting)"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={clsx("rounded-full px-3 py-1 text-xs font-bold uppercase", riskClass(h.riskLevel))}>{h.riskLevel}</span>
        <span className="font-mono text-sm text-mist">{h.status}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-mist/50">Last valid level</dt>
          <dd className="font-mono text-mist">{h.levelM == null ? "—" : `${h.levelM.toFixed(2)} m`}</dd>
        </div>
        <div>
          <dt className="text-xs text-mist/50">Reading age</dt>
          <dd className="font-mono text-mist">{h.ageDays == null ? "—" : `${h.ageDays.toFixed(1)} days`}</dd>
        </div>
      </dl>
      {h.primaryRisk && <p className="mt-4 text-sm text-mist/70">{h.primaryRisk}</p>}
      {h.action && <p className="mt-2 text-sm font-medium text-mist">→ {h.action}</p>}
      {compact && (
        <Link href="/reservoir" className="mt-4 inline-block text-xs text-river hover:underline">
          Full prediction details →
        </Link>
      )}
    </div>
  );
}