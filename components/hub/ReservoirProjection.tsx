import clsx from "clsx";
import { RESERVOIR_CONFIG } from "@/lib/waterQualityDSS";
import type { ProjectionDay } from "@/lib/reservoirDSS";

// Projected Trend: where the reservoir level is heading over the next 7 days.
// Band = lowest to highest level the MIKE rules allow; the line is its middle.

const W = 640, H = 240, L = 40, R = 118, T = 14, B = 30;
const AXIS = "fill-current text-mist/50";

function dayShort(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()}`;
}
const decisionTone: Record<string, string> = {
  EMERGENCY: "text-red-300",
  CAUTION: "text-amber-300",
  "OVERFLOW RISK": "text-orange-300",
  STABLE: "text-emerald-300",
  UNCERTAIN: "text-mist/50",
};
const decisionLabel: Record<string, string> = {
  EMERGENCY: "Emergency",
  CAUTION: "Caution",
  "OVERFLOW RISK": "Overflow risk",
  STABLE: "Stable",
  UNCERTAIN: "Too uncertain to call",
};

export function ReservoirProjection({ days, ageDays }: { days: ProjectionDay[] | null; ageDays: number | null }) {
  if (!days) {
    return (
      <div className="rounded-xl bg-white/5 p-6">
        <h3 className="font-display text-base font-semibold text-mist">Projected Trend, next 7 days</h3>
        <p className="mt-3 text-sm text-mist/50">No usable level reading, so there is nothing to project from.</p>
      </div>
    );
  }
  const max = RESERVOIR_CONFIG.maxLevelM;
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(days.length - 1, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const mid = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.levelM).toFixed(1)}`).join("");
  const upper = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.maxM).toFixed(1)}`).join("");
  const lower = [...days].reverse().map((d, i) => `L${x(days.length - 1 - i).toFixed(1)},${y(d.minM).toFixed(1)}`).join("");
  const band = `${upper}${lower}Z`;
  const lines = [
    { v: RESERVOIR_CONFIG.overflowLevelM, label: "Overflow 4.8 m", color: "#fb923c" },
    { v: RESERVOIR_CONFIG.optimalRechargeMinM, label: "Recharge min 2.0 m", color: "#fbbf24" },
    { v: RESERVOIR_CONFIG.emergencyMinM, label: "Emergency 0.5 m", color: "#f87171" },
  ];
  const wide = ageDays != null && ageDays > 2;
  return (
    <div className="rounded-xl bg-white/5 p-6">
      <h3 className="font-display text-base font-semibold text-mist">Projected Trend, next 7 days</h3>
      <p className="mt-1 text-xs text-mist/50">
        The shaded band is the lowest to highest level the MIKE rules allow. The line is the middle of the band.
      </p>
      {wide && (
        <p className="mt-3 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-300">
          The band is wide because the last reading is {ageDays == null ? "old" : `${ageDays.toFixed(1)} days old`} and the uncertainty grows every day.
          Get a fresh level reading to narrow it. Until then this is a range, not a prediction.
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Projected reservoir level for the next 7 days">
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-white/10" />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" className={AXIS}>{v}</text>
          </g>
        ))}
        <path d={band} fill="#2f7df6" opacity="0.22" />
        {lines.map((l) => (
          <g key={l.label}>
            <line x1={L} x2={W - R} y1={y(l.v)} y2={y(l.v)} stroke={l.color} strokeDasharray="4 3" strokeWidth="1.2" />
            <text x={W - R + 6} y={y(l.v) + 3} fontSize="10" fill={l.color}>{l.label}</text>
          </g>
        ))}
        <path d={mid} fill="none" stroke="#38bdf8" strokeWidth="2.4" />
        {days.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.levelM)} r="3" fill="#38bdf8">
            <title>{`${dayShort(d.date)}: ${d.minM.toFixed(2)} to ${d.maxM.toFixed(2)} m`}</title>
          </circle>
        ))}
        {days.map((d, i) => (
          <text key={d.date} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" className={AXIS}>{i === 0 ? "Today" : dayShort(d.date)}</text>
        ))}
        <text x={L} y={T - 3} fontSize="10" className={AXIS}>level in metres</text>
      </svg>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-mist/40">
              <th className="py-2 pr-3 font-semibold">Day</th>
              <th className="py-2 pr-3 font-semibold">Likely level</th>
              <th className="py-2 pr-3 font-semibold">Range</th>
              <th className="py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t border-white/5 transition-colors duration-150 hover:bg-white/5 motion-reduce:transition-none">
                <td className="py-2 pr-3 text-mist">{d.dayOffset === 0 ? "Today" : dayShort(d.date)}</td>
                <td className="py-2 pr-3 font-mono text-mist">{d.levelM.toFixed(2)} m</td>
                <td className="py-2 pr-3 font-mono text-mist/70">{d.minM.toFixed(2)} to {d.maxM.toFixed(2)} m</td>
                <td className={clsx("py-2", decisionTone[d.decision])}>
                  {decisionLabel[d.decision]}
                  {d.decision !== "UNCERTAIN" && d.couldBeEmergency && d.decision !== "EMERGENCY" ? <span className="text-mist/40">, could drop below 0.5 m</span> : null}
                  {d.decision !== "UNCERTAIN" && d.couldOverflow && d.decision !== "OVERFLOW RISK" ? <span className="text-mist/40">, could pass 4.8 m</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-mist/40">
        Uses this month&apos;s rainfall against normal (see Rainfall Analysis). It does not use the 7-day weather forecast.
      </p>
    </div>
  );
}