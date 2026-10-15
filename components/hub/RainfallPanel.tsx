import clsx from "clsx";
import {
  RAIN_CATEGORIES,
  categorize,
  weekdayName,
  type RainCategory,
  type RainfallReport,
} from "@/lib/rainfall";
import { rainStatusFor } from "@/lib/reservoirDSS";

// Rainfall Analysis section for the dashboard. Server component, plain SVG
// charts (no client JS). Written so a visitor can read it at a glance and a
// forecaster still gets the numbers: daily totals, chance of rain, hour by
// hour for 48 h, month so far against the 2000–2024 normal, and 12 months.

const CAT_COLOR: Record<RainCategory, string> = {
  dry: "#64748b",
  light: "#38bdf8",
  moderate: "#2f7df6",
  heavy: "#f59e0b",
  "very-heavy": "#ef4444",
};
const NORMAL_COLOR = "#e5e7eb";
const AXIS = "fill-current text-mist/50";

function niceMax(v: number, floor: number) {
  const x = Math.max(v, floor);
  const steps = [5, 10, 20, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];
  return steps.find((s) => s >= x) ?? Math.ceil(x / 100) * 100;
}
function dayLabel(date: string) {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(date.slice(5, 7)) - 1];
  return `${Number(date.slice(8, 10))} ${m}`;
}
function hourLabel(t: string) {
  const h = Number(t.slice(11, 13));
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 p-5 transition duration-200 hover:bg-white/[0.07] motion-reduce:transition-none">
      <h3 className="font-display text-base font-semibold text-mist">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-mist/50">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; line?: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mist/60">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.line ? (
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" stroke={i.color} strokeWidth="2" strokeDasharray={i.dashed ? "4 3" : undefined} />
            </svg>
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ── Past 30 days ─────────────────────────────────────────────
function PastChart({ days }: { days: RainfallReport["past30"] }) {
  const W = 640, H = 200, L = 36, R = 8, T = 12, B = 26;
  const vals = days.map((d) => d.mm ?? 0);
  const max = niceMax(Math.max(...vals), 10);
  const bw = (W - L - R) / days.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const known = days.filter((d) => d.mm != null);
  const avg = known.length ? known.reduce((a, d) => a + (d.mm ?? 0), 0) / known.length : 0;
  const ticks = [0, max / 2, max];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily rainfall for the past 30 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-white/10" />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" className={AXIS}>{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = L + i * bw;
          if (d.mm == null) return <rect key={d.date} x={x + bw / 2 - 1.5} y={y(0) - 3} width="3" height="3" fill="#64748b" opacity="0.6" />;
          const h = Math.max(d.mm > 0 ? 1.5 : 0, y(0) - y(d.mm));
          return (
            <g key={d.date}>
              <title>{`${dayLabel(d.date)}: ${d.mm.toFixed(1)} mm`}</title>
              <rect className="transition duration-150 hover:opacity-70 motion-reduce:transition-none" x={x + 1.5} y={y(0) - h} width={Math.max(2, bw - 3)} height={h} rx="1.5" fill={CAT_COLOR[categorize(d.mm)]} />
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke={NORMAL_COLOR} strokeDasharray="4 3" strokeWidth="1.2" />
        {days.map((d, i) =>
          i % 5 === 0 || i === days.length - 1 ? (
            <text key={d.date} x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" className={AXIS}>
              {dayLabel(d.date)}
            </text>
          ) : null,
        )}
        <text x={L} y={T - 2} fontSize="10" className={AXIS}>mm per day</text>
      </svg>
      <Legend
        items={[
          ...RAIN_CATEGORIES.map((c) => ({ label: c.label, color: CAT_COLOR[c.key] })),
          { label: `30-day average ${avg.toFixed(1)} mm/day`, color: NORMAL_COLOR, dashed: true, line: true },
        ]}
      />
    </>
  );
}

// ── Next 48 hours ────────────────────────────────────────────
function HourlyChart({ hours }: { hours: RainfallReport["hourly"] }) {
  const W = 640, H = 210, L = 36, R = 36, T = 14, B = 34;
  const max = niceMax(Math.max(...hours.map((h) => h.mm)), 2);
  const bw = (W - L - R) / Math.max(hours.length, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const yp = (p: number) => T + (H - T - B) * (1 - p / 100);
  const probPts = hours.map((h, i) => (h.probability == null ? null : [L + i * bw + bw / 2, yp(h.probability)] as const));
  const path = probPts.reduce((acc, p) => (p ? `${acc}${acc ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}` : acc), "");
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hourly rainfall and chance of rain for the next 48 hours">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-white/10" />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize="10" className={AXIS}>{+(max * f).toFixed(1)}</text>
            <text x={W - R + 6} y={yp(100 * f) + 3} fontSize="10" className={AXIS}>{100 * f}%</text>
          </g>
        ))}
        {hours.map((h, i) => {
          const x = L + i * bw;
          const hh = Math.max(h.mm > 0 ? 1.5 : 0, y(0) - y(h.mm));
          const midnight = h.time.slice(11, 13) === "00";
          return (
            <g key={h.time}>
              <title>{`${dayLabel(h.time.slice(0, 10))} ${hourLabel(h.time)}: ${h.mm.toFixed(1)} mm, ${h.probability ?? "?"}% chance`}</title>
              {midnight && <line x1={x} x2={x} y1={T} y2={H - B} stroke="currentColor" className="text-white/20" strokeDasharray="2 3" />}
              <rect className="transition duration-150 hover:opacity-70 motion-reduce:transition-none" x={x + 0.8} y={y(0) - hh} width={Math.max(1.5, bw - 1.6)} height={hh} fill={h.mm >= 7.5 ? "#ef4444" : h.mm >= 2.5 ? "#2f7df6" : "#38bdf8"} />
              {i % 6 === 0 && (
                <text x={x + bw / 2} y={H - 18} textAnchor="middle" fontSize="10" className={AXIS}>{hourLabel(h.time)}</text>
              )}
              {(i === 0 || midnight) && (
                <text x={x + 2} y={H - 5} fontSize="10" className={AXIS}>{dayLabel(h.time.slice(0, 10))}</text>
              )}
            </g>
          );
        })}
        {path && <path d={path} fill="none" stroke="#fbbf24" strokeWidth="1.8" />}
        <text x={L} y={T - 3} fontSize="10" className={AXIS}>mm per hour</text>
      </svg>
      <Legend
        items={[
          { label: "Light (under 2.5 mm/h)", color: "#38bdf8" },
          { label: "Moderate (2.5 to 7.5)", color: "#2f7df6" },
          { label: "Heavy (7.5 mm/h or more)", color: "#ef4444" },
          { label: "Chance of rain (right axis)", color: "#fbbf24", line: true },
        ]}
      />
    </>
  );
}

// ── Month so far vs normal ───────────────────────────────────
function MonthChart({ m }: { m: RainfallReport["monthToDate"] }) {
  const W = 640, H = 210, L = 40, R = 14, T = 14, B = 26;
  const normals = m.cumulative.map((c) => c.normal).filter((v): v is number => v != null);
  const actuals = m.cumulative.map((c) => c.actual).filter((v): v is number => v != null);
  const max = niceMax(Math.max(0, ...normals, ...actuals), 25);
  const x = (day: number) => L + ((W - L - R) * (day - 1)) / Math.max(m.daysInMonth - 1, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = (pts: { day: number; v: number | null }[]) =>
    pts.filter((p) => p.v != null).map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.v as number).toFixed(1)}`).join("");
  const normalPath = line(m.cumulative.map((c) => ({ day: c.day, v: c.normal })));
  const actualPts = m.cumulative.filter((c) => c.actual != null);
  const actualPath = line(actualPts.map((c) => ({ day: c.day, v: c.actual })));
  const area = actualPts.length
    ? `${actualPath}L${x(actualPts[actualPts.length - 1].day).toFixed(1)},${y(0)}L${x(1).toFixed(1)},${y(0)}Z`
    : "";
  const last = actualPts[actualPts.length - 1];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rain collected so far this month compared with normal">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-white/10" />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize="10" className={AXIS}>{Math.round(max * f)}</text>
          </g>
        ))}
        {area && <path d={area} fill="#2f7df6" opacity="0.18" />}
        <path d={normalPath} fill="none" stroke={NORMAL_COLOR} strokeWidth="1.6" strokeDasharray="5 4" />
        {actualPath && <path d={actualPath} fill="none" stroke="#38bdf8" strokeWidth="2.4" />}
        {last && (
          <g>
            <circle className="transition duration-150 hover:opacity-70" cx={x(last.day)} cy={y(last.actual as number)} r="3.5" fill="#38bdf8" />
            <text x={Math.min(x(last.day) + 8, W - 90)} y={Math.max(T + 10, y(last.actual as number) - 8)} fontSize="11" className="fill-current text-mist">{fmt0(last.actual as number)} mm so far</text>
          </g>
        )}
        {[1, 8, 15, 22, m.daysInMonth].map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="10" className={AXIS}>{d}</text>
        ))}
        <text x={L} y={T - 3} fontSize="10" className={AXIS}>mm collected since the 1st</text>
      </svg>
      <Legend
        items={[
          { label: "This month", color: "#38bdf8", line: true },
          { label: "Normal (2000 to 2024 average)", color: NORMAL_COLOR, dashed: true, line: true },
        ]}
      />
    </>
  );
}

// ── Last 12 months ───────────────────────────────────────────
function YearChart({ months }: { months: RainfallReport["months12"] }) {
  const W = 640, H = 210, L = 40, R = 8, T = 14, B = 34;
  const max = niceMax(Math.max(...months.map((m) => Math.max(m.mm ?? 0, m.normalMm ?? 0))), 50);
  const bw = (W - L - R) / months.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly rainfall for the last 12 months against normal">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-white/10" />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize="10" className={AXIS}>{Math.round(max * f)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = L + i * bw;
          const h = m.mm == null ? 0 : Math.max(1, y(0) - y(m.mm));
          return (
            <g key={m.month}>
              <title>{`${m.label} ${m.year}: ${m.mm == null ? "no data" : `${fmt0(m.mm)} mm`}${m.normalMm != null ? `, normal ${fmt0(m.normalMm)} mm` : ""}${m.partial ? " (month in progress)" : ""}`}</title>
              <rect className="transition duration-150 hover:opacity-70 motion-reduce:transition-none" x={x + 5} y={y(0) - h} width={bw - 10} height={h} rx="2" fill="#2f7df6" opacity={m.partial ? 0.5 : 1} />
              {m.normalMm != null && <line x1={x + 2} x2={x + bw - 2} y1={y(m.normalMm)} y2={y(m.normalMm)} stroke={NORMAL_COLOR} strokeWidth="2" />}
              <text x={x + bw / 2} y={H - 18} textAnchor="middle" fontSize="10" className={AXIS}>{m.label}</text>
              {(i === 0 || m.label === "Jan") && <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="9" className={AXIS}>{m.year}</text>}
            </g>
          );
        })}
        <text x={L} y={T - 3} fontSize="10" className={AXIS}>mm per month</text>
      </svg>
      <Legend
        items={[
          { label: "Rain that month", color: "#2f7df6" },
          { label: "Normal for that month", color: NORMAL_COLOR, line: true },
          { label: "Lighter bar = month still in progress", color: "#2f7df6" },
        ]}
      />
    </>
  );
}

// ── Panel ────────────────────────────────────────────────────
export function RainfallPanel({ report }: { report: RainfallReport | null }) {
  if (!report) {
    return (
      <div className="mt-4 rounded-xl bg-white/5 p-6">
        <p className="text-sm text-mist/50">Could not reach the weather service. Try again in a few minutes.</p>
      </div>
    );
  }
  const r = report;
  const m = r.monthToDate;
  const pct = m.percentOfNormal;
  const monthStatus = rainStatusFor(pct);
  const monthWords =
    pct == null
      ? "Not enough history to compare"
      : monthStatus === "CRITICAL DROUGHT"
        ? "Far below normal"
        : monthStatus === "SEVERE DROUGHT"
          ? "Well below normal"
          : monthStatus === "ABOVE NORMAL"
            ? "Wetter than normal"
            : "Close to normal";
  const toneClass = r.outlook.tone === "heavy" ? "border-red-400/60 text-red-300" : r.outlook.tone === "wet" ? "border-sky-400/60 text-sky-300" : "border-emerald-400/50 text-emerald-300";

  return (
    <div className="mt-4 space-y-5">
      {/* Plain-words summary */}
      <div className={clsx("rounded-xl border-l-4 bg-white/5 p-5", toneClass)}>
        <p className="font-display text-xl font-semibold text-mist">{r.outlook.headline}</p>
        <p className="mt-1 text-sm text-mist/70">{r.outlook.detail}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white/5 p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <p className="font-mono text-2xl font-semibold text-mist">{fmt0(r.totals.past7)} mm</p>
          <p className="mt-1 text-xs text-mist/50">Rain in the last 7 days</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <p className="font-mono text-2xl font-semibold text-mist">{fmt0(r.totals.next7)} mm</p>
          <p className="mt-1 text-xs text-mist/50">Forecast for the next 7 days ({fmt0(r.totals.next3)} mm in the first 3)</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <p className="font-mono text-2xl font-semibold text-mist">{r.rainyDaysNext7} of 7</p>
          <p className="mt-1 text-xs text-mist/50">Days with 1 mm or more expected</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <p className={clsx("font-mono text-2xl font-semibold", monthStatus === "CRITICAL DROUGHT" || monthStatus === "SEVERE DROUGHT" ? "text-amber-400" : "text-mist")}>
            {pct == null ? "No data" : `${fmt0(pct)}%`}
          </p>
          <p className="mt-1 text-xs text-mist/50">
            {monthWords}: {fmt0(m.actualMm)} mm vs {fmt0(m.normalToDateMm)} mm normal for 1 to {m.daysCompared} {m.monthLabel.split(" ")[0]}
            {m.lowConfidence ? ". Only a few days in, so this can swing a lot." : ""}
          </p>
        </div>
      </div>

      {/* 7-day forecast */}
      <Card title="Next 7 days" subtitle="Rain expected each day, and how likely it is">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {r.forecast7.map((d, i) => {
            const cat = categorize(d.mm);
            const catInfo = RAIN_CATEGORIES.find((c) => c.key === cat)!;
            const fill = Math.min(1, (d.mm ?? 0) / 50);
            return (
              <div key={d.date} className="group rounded-lg bg-white/5 p-3 text-center transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <p className="text-xs font-semibold text-mist">{i === 0 ? "Today" : weekdayName(d.date).slice(0, 3)}</p>
                <p className="text-[10px] text-mist/40">{dayLabel(d.date)}</p>
                <div className="mx-auto mt-2 flex h-14 w-5 items-end overflow-hidden rounded bg-white/10" aria-hidden>
                  <div className="w-full transition-all duration-300 group-hover:brightness-125 motion-reduce:transition-none" style={{ height: `${Math.max(d.mm ? 6 : 0, fill * 100)}%`, background: CAT_COLOR[cat] }} />
                </div>
                <p className="mt-2 font-mono text-sm text-mist">{d.mm == null ? "?" : `${d.mm.toFixed(d.mm >= 10 ? 0 : 1)} mm`}</p>
                <p className="text-[11px]" style={{ color: CAT_COLOR[cat] === "#64748b" ? undefined : CAT_COLOR[cat] }}>{catInfo.label}</p>
                {d.probability != null && <p className="mt-1 text-[10px] text-mist/50">{d.probability}% chance</p>}
                {d.hours != null && d.hours > 0 && (d.mm ?? 0) >= 1 && <p className="text-[10px] text-mist/40">about {d.hours} h of rain</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Hour by hour, next 48 hours" subtitle="For timing: when the rain is expected to fall">
          {r.hourly.length ? <HourlyChart hours={r.hourly} /> : <p className="text-sm text-mist/40">No hourly forecast available.</p>}
        </Card>
        <Card title="Rain over the last 30 days" subtitle="Each bar is one day. The dashed line is the 30-day average.">
          <PastChart days={r.past30} />
        </Card>
        <Card
          title={`${m.monthLabel} so far versus normal`}
          subtitle={r.historyAvailable ? `Rain collected since the 1st, against the average of the same days in 2000 to 2024` : "Normal is unavailable right now"}
        >
          <MonthChart m={m} />
        </Card>
        <Card title="Last 12 months" subtitle="Monthly totals against the 2000 to 2024 average for each month">
          <YearChart months={r.months12} />
        </Card>
      </div>

      <details className="rounded-xl bg-white/5 p-5 text-sm text-mist/70">
        <summary className="cursor-pointer font-semibold text-mist">How to read this</summary>
        <div className="mt-3 space-y-3">
          <p>1 mm of rain is 1 litre of water on every square metre of ground. 25 mm in a day is 25 litres on each square metre.</p>
          <p>Daily scale used on this page:</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {RAIN_CATEGORIES.map((c) => (
              <li key={c.key} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CAT_COLOR[c.key] }} />
                <span className="text-mist">{c.label}</span>
                <span className="text-mist/50">{c.blurb}</span>
              </li>
            ))}
          </ul>
          <p>Chance of rain is the likelihood that any measurable rain falls on that day. It does not say how much.</p>
          <p>Normal means the average over 2000 to 2024 for the same dates, so a comparison part-way through a month only uses the days that have passed.</p>
          <p>The reservoir decision uses the month-versus-normal figure: below 50% counts as severe drought, below 20% as critical, above 120% as wetter than normal.</p>
          <p className="text-xs text-mist/40">Source: Open-Meteo model data for the site coordinates, not a rain gauge on the property. Forecast refreshes about every 30 minutes.</p>
        </div>
      </details>
    </div>
  );
}