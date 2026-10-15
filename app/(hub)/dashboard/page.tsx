import { createClient } from "@/lib/supabase/server";
import { AlertCard } from "@/components/ui/AlertCard";
import { DismissibleAlerts } from "@/components/hub/DismissibleAlerts";
import { overallDeviceQuality } from "@/lib/decisionSupport";
import {
  analyzeRechargeOpportunity,
  evaluateMetric,
  inferPumpStatus,
  RESERVOIR_CONFIG,
  SENSOR_CONFIGS,
  type MetricStatus,
} from "@/lib/waterQualityDSS";
import { QualityDonut, SimpleBarChart, ConnectivityPie } from "./DashboardCharts";
import type { Device, Alert, SensorReading } from "@/lib/types";
import { getRainfallReport } from "@/lib/rainfall";
import { RainfallPanel } from "@/components/hub/RainfallPanel";
import { fetchLatestReadings } from "@/lib/supabase/fetchLatestReadings";
import { getReservoirStatus } from "@/lib/reservoirStatus";
import { ReservoirDecisionCard } from "@/components/hub/ReservoirDecisionCard";
import { assessPressure, overallLeakStatus, type PressureStatus } from "@/lib/leakDetection";
import { assessMeterRealtime, assessMeterHistory, METER_STATUS_LABEL, type MeterSystemStatus } from "@/lib/waterMeterDSS";
import clsx from "clsx";

export const dynamic = "force-dynamic"; // avoid stale cached device data

const wellMetricLabels: Record<string, string> = {
  ph: "PH",
  temperature: "Temperature",
  temperature_ph: "Temperature of PH",
  temperature_tds: "Temperature of TDS",
  conductivity: "Conductivity",
  tds: "TDS",
  salinity: "Salinity",
  level: "Level",
};

// The quality metrics evaluateMetric actually has real thresholds for
// (from the recovered DSS script) — used to decide which readings count
// toward an overall water-quality verdict, separate from temperature/level
// which are tracked but don't drive a contamination judgement on their own.
const QUALITY_METRICS = ["ph", "conductivity", "tds", "salinity"];

// --- Circular gauge geometry -------------------------------------------
// Angle convention for EVERYTHING below (ticks, arc math, needle rotation)
// is the same "clock" system: 0deg = 12 o'clock, increasing clockwise.
// point() and SVG's own <g transform="rotate(deg, cx, cy)"> both treat a
// bigger positive number as "further clockwise from straight up" — using
// one convention everywhere (instead of mixing a math-style angle for the
// arc with SVG's screen-style angle for the needle, which is what caused
// the needle to sweep through the bottom of the dial instead of the top)
// is what keeps the needle actually pointing at the coloured band.
function point(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
// 270° dial running from -135deg (bottom-left) up over the top to
// +135deg (bottom-right), leaving a 90° gap at the bottom — the standard
// automotive-gauge layout, matching the reference design.
const GAUGE_START = -135;
const GAUGE_SWEEP = 270;

// Draws an arc from fromDeg to toDeg in <=90° steps instead of one long
// sweep. A single SVG "A" command becomes ambiguous exactly at 180°
// (start/end diametrically opposite — see the fix earlier in this file,
// which is what broke the very first version of this gauge), and our
// total sweep here (up to 270°) would cross that 180° point for plenty
// of real values. Chunking into <=90° pieces sidesteps the ambiguous
// case entirely rather than special-casing it.
function ringPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  if (toDeg <= fromDeg) return "";
  const start = point(cx, cy, r, fromDeg);
  let d = `M ${start.x} ${start.y}`;
  let a = fromDeg;
  while (a < toDeg) {
    const next = Math.min(a + 90, toDeg);
    const p = point(cx, cy, r, next);
    d += ` A ${r} ${r} 0 0 1 ${p.x} ${p.y}`; // increasing angle = clockwise, see point()
    a = next;
  }
  return d;
}

// Digital-speedometer-style dial: a single glowing progress arc (instead
// of a needle) sweeps from the gauge's start up to the current value,
// with tick marks + numbers around the rim and the value spelled out as
// a big digital readout in the middle — matching the reference design.
function PressureGauge({ value, max, online, unit = "bar" }: { value: number; max: number; online: boolean; unit?: string }) {
  const cx = 90;
  const cy = 90;
  const clamped = Math.max(0, Math.min(max, value));
  const valueAngle = GAUGE_START + (clamped / max) * GAUGE_SWEEP;
  const accent = "#f5a524";

  // 12 ticks (0..max in 11 even steps); every other one is a longer,
  // brighter "major" tick with its value printed next to it.
  const tickCount = 12;
  const ticks = Array.from({ length: tickCount }, (_, i) => i).map((i) => {
    const deg = GAUGE_START + i * (GAUGE_SWEEP / (tickCount - 1));
    const isMajor = i % 2 === 0;
    const outer = point(cx, cy, 82, deg);
    const inner = point(cx, cy, isMajor ? 72 : 76, deg);
    const labelPos = point(cx, cy, 65, deg);
    const tickValue = Math.round((i / (tickCount - 1)) * max);
    return { key: i, x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, isMajor, labelPos, tickValue };
  });

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[180px]" style={{ opacity: online ? 1 : 0.4 }}>
      <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full">
        {/* Faint full-range track so the unfilled portion of the dial is
            still legible, not just black. */}
        <path d={ringPath(cx, cy, 55, GAUGE_START, GAUGE_START + GAUGE_SWEEP)} fill="none" stroke="#ffffff14" strokeWidth="4" strokeLinecap="round" />
        {/* The lit progress arc, glowing via a drop-shadow blur. */}
        {clamped > 0 && (
          <path
            d={ringPath(cx, cy, 55, GAUGE_START, valueAngle)}
            fill="none"
            stroke={accent}
            strokeWidth="4"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${accent}) drop-shadow(0 0 2px ${accent})` }}
          />
        )}
        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isMajor ? "#e7e9ee" : `${accent}99`}
            strokeWidth={t.isMajor ? 1.5 : 1}
            strokeDasharray={t.isMajor ? undefined : "1.5 1.5"}
          />
        ))}
        {ticks
          .filter((t) => t.isMajor)
          .map((t) => (
            <text
              key={`label-${t.key}`}
              x={t.labelPos.x}
              y={t.labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8.5"
              fontWeight="600"
              fill="#9aa0ad"
            >
              {t.tickValue}
            </text>
          ))}
        {/* Bright dot marking exactly where the progress arc currently ends. */}
        {clamped > 0 && (
          <circle cx={point(cx, cy, 55, valueAngle).x} cy={point(cx, cy, 55, valueAngle).y} r="2.5" fill={accent} style={{ filter: `drop-shadow(0 0 3px ${accent})` }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold text-mist">{value.toFixed(1)}</span>
        <span className="text-[10px] font-semibold" style={{ color: accent }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// Simple colored ring for the overall health score (0-100), drawn with
// stroke-dasharray on a circle rather than conic-gradient for broader
// rendering reliability.
function HealthRing({ score }: { score: number }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? "#5C7A5C" : score >= 60 ? "#f59e0b" : "#C1622D";
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32">
      <circle cx="60" cy="60" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
      <circle
        cx="60"
        cy="60"
        r={r}
        stroke={color}
        strokeWidth="10"
        fill="none"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="66" textAnchor="middle" className="fill-mist font-mono text-2xl font-bold">
        {score}
      </text>
    </svg>
  );
}

function riskBadgeClass(level: "Low" | "Moderate" | "High" | "Unknown") {
  return clsx(
    "rounded-full px-3 py-1 text-xs font-semibold uppercase",
    level === "Low" && "bg-moss text-white",
    level === "Moderate" && "bg-amber-500 text-white",
    level === "High" && "bg-clay text-white",
    level === "Unknown" && "bg-white/10 text-mist/60"
  );
}

function metricStatusClass(status: MetricStatus) {
  return clsx(
    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase",
    status === "optimal" && "bg-moss/20 text-moss-light",
    status === "warning" && "bg-amber-500/20 text-amber-400",
    (status === "critical" || status === "emergency") && "bg-clay/20 text-clay-light",
    status === "unknown" && "bg-white/10 text-mist/40"
  );
}

// Colors the big number itself by status, matching the old site's card
// design (a green/yellow/red value, not just a neutral white one).
function metricValueColorClass(status: MetricStatus) {
  return clsx(
    "font-mono text-2xl font-semibold",
    status === "optimal" && "text-moss-light",
    status === "warning" && "text-amber-400",
    (status === "critical" || status === "emergency") && "text-clay-light",
    status === "unknown" && "text-mist"
  );
}

// Buckets a device's latest-per-metric readings into the 4 groups the
// distribution donuts use, based on the REAL waterQualityDSS thresholds —
// not the DB's optimal_min/optimal_max columns, which the live DTUIP sync
// routes never populate (only the mock seed does), so relying on those
// would silently show "unknown" for every real synced reading.
function bucketQuality(metrics: { metric: string; reading: SensorReading }[]) {
  const counts = { optimal: 0, warning: 0, critical: 0, offline: 0 };
  for (const metric of QUALITY_METRICS) {
    const found = metrics.find((m) => m.metric === metric);
    if (!found) {
      counts.offline++;
      continue;
    }
    const { status } = evaluateMetric(metric, Number(found.reading.value));
    if (status === "optimal") counts.optimal++;
    else if (status === "warning") counts.warning++;
    else if (status === "critical" || status === "emergency") counts.critical++;
    else counts.offline++;
  }
  return counts;
}

// Overall verdict across the quality metrics a device actually reports —
// worst status wins, matching how a real operator would read it (one bad
// reading means the water isn't safe, regardless of how many other
// readings are fine).
function overallVerdict(metrics: { metric: string; reading: SensorReading }[]): {
  status: MetricStatus;
  label: string;
} {
  const relevant = metrics.filter((m) => QUALITY_METRICS.includes(m.metric));
  if (relevant.length === 0) return { status: "unknown", label: "Cannot assess — no quality readings yet" };

  const rank: Record<MetricStatus, number> = { optimal: 0, warning: 1, critical: 2, emergency: 3, unknown: 0 };
  let worst: MetricStatus = "optimal";
  for (const { metric, reading } of relevant) {
    const { status } = evaluateMetric(metric, Number(reading.value));
    if (rank[status] > rank[worst]) worst = status;
  }
  const labels: Record<MetricStatus, string> = {
    optimal: "Good",
    warning: "Fair — monitor closely",
    critical: "Poor — treatment recommended",
    emergency: "Unsafe — immediate treatment needed",
    unknown: "Unknown",
  };
  return { status: worst, label: labels[worst] };
}

function riskFromStatus(status: MetricStatus): "Low" | "Moderate" | "High" | "Unknown" {
  if (status === "optimal") return "Low";
  if (status === "warning") return "Moderate";
  if (status === "critical" || status === "emergency") return "High";
  return "Unknown";
}

export default async function DashboardPage() {
  const supabase = createClient();

  const [{ data: devices }, { data: alerts }, { data: readings }] = await Promise.all([
    supabase.from("devices").select("*"),
    supabase.from("alerts").select("*").eq("resolved", false).order("created_at", { ascending: false }),
    fetchLatestReadings(supabase, { perSeries: 200 }).then((data) => ({ data })),
  ]);

  const deviceList = (devices as Device[] | null) ?? [];
  const alertList = (alerts as Alert[] | null) ?? [];
  const allReadings = (readings as SensorReading[] | null) ?? [];

  // Rainfall Analysis — real live data (Open-Meteo, free/no key), not
  // dependent on the MIKE pipeline or any physical hardware. Wrapped in
  // try/catch since it's an external network call that can legitimately
  // fail (rate limit, connectivity) — the rest of the dashboard shouldn't
  // break if the weather API has a bad moment.
  const rainfall = await getRainfallReport().catch(() => null);
  const reservoirStatus = await getReservoirStatus(supabase).catch(() => null);

  // Keyed by `${device_id}::${metric}` — NOT just device_id — because a
  // single device (e.g. "Ground Water Well") can now hold several metrics
  // (ph, temperature, conductivity, tds, salinity) since the metric column
  // was added to sensor_readings. Keying by device_id alone would collapse
  // all of a well's metrics down to whichever one happened to sort first.
  const latestByDeviceMetric = new Map<string, SensorReading>();
  for (const r of allReadings) {
    const key = `${r.device_id}::${r.metric}`;
    if (!latestByDeviceMetric.has(key)) latestByDeviceMetric.set(key, r);
  }

  const total = deviceList.length;
  const online = deviceList.filter((d) => d.status === "online").length;
  const systemStatus = online === total && total > 0 ? "Optimal" : online > 0 ? "Warning" : "Critical";

  const pressureDevices = deviceList.filter((d) => d.group_type === "pressure");
  const wellDevices = deviceList.filter((d) => d.group_type === "groundwater_well");
  const meterDevices = deviceList.filter((d) => d.group_type === "smart_water_meter");
  const wellDevice = wellDevices[0];

  // For single-metric devices (pressure sensors, flow meters) there's only
  // ever one metric per device, so grabbing the newest reading for that
  // device_id regardless of metric name is safe and simple.
  const readingFor = (deviceId: string) => {
    for (const r of allReadings) {
      if (r.device_id === deviceId) return r;
    }
    return undefined;
  };

  const metricsFor = (deviceId: string | undefined) =>
    deviceId
      ? Array.from(latestByDeviceMetric.entries())
          .filter(([key]) => key.startsWith(`${deviceId}::`))
          .map(([key, reading]) => ({ metric: key.split("::")[1], reading }))
      : [];

  // For the well/reservoir, which can hold several metrics per device,
  // look up by the exact (device, metric) pair instead.
  const wellReading = (metric: string) =>
    wellDevice ? latestByDeviceMetric.get(`${wellDevice.id}::${metric}`) : undefined;

  const wellMetrics = metricsFor(wellDevice?.id);

  const totalFlow = meterDevices.reduce((sum, d) => {
    const r = readingFor(d.id);
    return sum + (r ? Number(r.value) : 0);
  }, 0);

  const avgPressure = pressureDevices.length
    ? (
        pressureDevices.reduce((sum, d) => {
          const r = readingFor(d.id);
          return sum + (r ? Number(r.value) : 0);
        }, 0) / pressureDevices.length
      ).toFixed(1)
    : "0.0";

  const phReading = wellReading("ph");

  // Reservoir — a separate real device (GWRES-01) from the Well, confirmed
  // via a recovered DSS script that hardcodes its own dtuip device ID.
  const reservoirDevices = deviceList.filter((d) => d.group_type === "groundwater_reservoir");
  const reservoirDevice = reservoirDevices[0];
  const reservoirMetrics = metricsFor(reservoirDevice?.id);

  // Recharge decision support — ported from the recovered IronPython DSS
  // script (lib/waterQualityDSS.ts). Needs the reservoir's latest quality
  // readings plus its two most recent level readings (to infer whether a
  // pump is currently running) — allReadings is already sorted newest-first.
  const reservoirLevelHistory = reservoirDevice
    ? allReadings.filter((r) => r.device_id === reservoirDevice.id && r.metric === "level")
    : [];
  const latestReservoirLevel = reservoirLevelHistory[0] ? Number(reservoirLevelHistory[0].value) : null;
  const pumpInference = reservoirLevelHistory[1]
    ? inferPumpStatus(
        { value: Number(reservoirLevelHistory[1].value), recordedAt: reservoirLevelHistory[1].recorded_at },
        { value: Number(reservoirLevelHistory[0].value), recordedAt: reservoirLevelHistory[0].recorded_at },
      )
    : { status: "UNKNOWN" as const, rateMPerHour: 0 };
  const reservoirLatestByMetric: Partial<Record<string, number>> = {};
  for (const { metric, reading } of reservoirMetrics) reservoirLatestByMetric[metric] = Number(reading.value);
  const rechargeAnalysis = analyzeRechargeOpportunity(reservoirLatestByMetric, latestReservoirLevel, pumpInference.status);

  // Reservoir capacity, as a real % of RESERVOIR_CONFIG.maxLevelM — the
  // project's own calibrated physical constant (see lib/waterQualityDSS.ts)
  // — rather than guessing from a generic optimal_min/optimal_max column.
  const reservoirCapacityPct =
    latestReservoirLevel == null ? null : Math.round((latestReservoirLevel / RESERVOIR_CONFIG.maxLevelM) * 100);

  // Overall well/reservoir verdicts, both driven by the same real
  // evaluateMetric thresholds — works correctly whether the underlying
  // reading came from the mock seed or the live DTUIP sync.
  const wellVerdict = overallVerdict(wellMetrics);
  const reservoirVerdict = overallVerdict(reservoirMetrics);
  const contaminationRisk = riskFromStatus(wellVerdict.status);
  const healthRisk = contaminationRisk; // same scale, kept as a separate field for clarity in the UI
  const reservoirContaminationRisk = riskFromStatus(reservoirVerdict.status);
  const reservoirTreatmentNeeded =
    reservoirContaminationRisk === "High" ? "Immediate" : reservoirContaminationRisk === "Moderate" ? "Recommended" : "None";

  // Recommendations text, matching the old site's exact "IMMEDIATE ACTION:
  // Water quality critical - Do not use for consumption" wording pattern —
  // driven by the real evaluated status, not hardcoded per device.
  function recommendationsForStatus(status: MetricStatus | "unknown"): string[] {
    if (status === "emergency" || status === "critical") {
      return ["IMMEDIATE ACTION: Water quality critical - Do not use for consumption."];
    }
    if (status === "warning") {
      return ["Monitor closely and consider treatment before use."];
    }
    if (status === "optimal") {
      return ["Water quality is within safe limits — no action needed."];
    }
    return ["No readings yet — cannot generate a recommendation."];
  }
  const reservoirRecommendations = recommendationsForStatus(reservoirVerdict.status);
  const wellQualityRecommendations = recommendationsForStatus(wellVerdict.status);

  // waterQuality.score kept for the numeric "(X/100)" display in the panel
  // header — this one still leans on decisionSupport's generic scorer,
  // which is fine for the mock seed but will show "Unknown" against real
  // DTUIP data until optimal_min/optimal_max get written by the sync
  // routes too. The qualitative verdict above (wellVerdict) is accurate
  // either way, so it's the one driving color/labels.
  const wellReadingsByMetric = new Map<string, SensorReading[]>(wellMetrics.map(({ metric, reading }) => [metric, [reading]]));
  const waterQuality = overallDeviceQuality(wellReadingsByMetric);

  const wellDistribution = bucketQuality(wellMetrics);
  const reservoirDistribution = bucketQuality(reservoirMetrics);

  const pressureChartData = pressureDevices
    .filter((d) => d.status === "online")
    .map((d) => ({ label: d.name ?? "Sensor", value: Number(readingFor(d.id)?.value ?? 0) }));
  const flowChartData = meterDevices
    .filter((d) => d.status === "online")
    .map((d) => ({ label: d.name ?? "Meter", value: Number(readingFor(d.id)?.value ?? 0) }));

  // System health: % of devices online, minus deductions for open alerts
  // by severity — same shape as before, just broken out with a grade +
  // recommendations list to match the live site's fuller panel.
  const deductionPerSeverity: Record<Alert["severity"], number> = { emergency: 15, immediate: 10, high: 8, medium: 4 };
  const deductions = alertList.reduce((sum, a) => sum + (deductionPerSeverity[a.severity] ?? 4), 0);
  const healthScore = total > 0 ? Math.max(0, Math.min(100, Math.round((online / total) * 100 - deductions))) : 0;
  const healthGrade = healthScore >= 80 ? "GOOD" : healthScore >= 60 ? "WARNING" : "CRITICAL";
  const offlineDevices = deviceList.filter((d) => d.status !== "online");
  const healthRecommendations: string[] = [];
  if (offlineDevices.length > 0) {
    healthRecommendations.push(`Focus on restoring offline sensor connectivity (${offlineDevices.length} of ${total} offline).`);
  }
  const severeAlerts = alertList.filter((a) => a.severity === "emergency" || a.severity === "immediate");
  if (severeAlerts.length > 0) {
    healthRecommendations.push(`Address ${severeAlerts.length} high-priority alert(s) currently open.`);
  }
  if (healthRecommendations.length === 0) {
    healthRecommendations.push("No immediate action needed — all systems reporting normally.");
  }

  // Leak detection: real algorithm now, ported from the recovered
  // PerformDSSAnalysis.py script (lib/leakDetection.ts) — critical <=15m,
  // warning <=20m, sudden drop >=5m within 1hr = leak signature. Runs per
  // pressure sensor against its own history (allReadings is already
  // newest-first), then rolls up to a single worst-case verdict. This
  // replaces the old placeholder that only counted how many sensors were
  // online. Flow meters aren't part of the real script's pressure-based
  // logic, so they're reported separately as supplementary info, not
  // folded into the verdict itself.
  const pressureAssessments = pressureDevices.map((d) => {
    const history = allReadings
      .filter((r) => r.device_id === d.id)
      .map((r) => ({ value: Number(r.value), recorded_at: r.recorded_at }));
    return { device: d, assessment: assessPressure(d.status === "online", history) };
  });
  const leakRollup = overallLeakStatus(pressureAssessments.map((p) => p.assessment));
  const flaggedPressureSensors = pressureAssessments.filter(
    (p) => p.assessment.status === "sudden_drop" || p.assessment.status === "critical_low" || p.assessment.status === "low_pressure"
  );
  const pressureOnlineCount = pressureDevices.filter((d) => d.status === "online").length;
  const flowOnlineCount = meterDevices.filter((d) => d.status === "online").length;
  const leakStatusTone: Record<PressureStatus, { text: string; label: string }> = {
    sudden_drop: { text: "text-red-400", label: "🔴 Possible leak detected" },
    critical_low: { text: "text-orange-400", label: "🟠 Critical low pressure" },
    low_pressure: { text: "text-amber-400", label: "🟡 Low pressure warning" },
    normal: { text: "text-moss-light", label: "✅ Monitoring active — normal" },
    no_data: { text: "text-purple-400", label: "🟣 No valid pressure data" },
    offline: { text: "text-clay-light", label: "Cannot analyze — sensors offline" },
  };

  return (
    <div>
      <div className="p-8">
        {/* Active alerts feed — real colors confirmed from the actual old
            theme's compiled CSS: alert-danger is #fed9db bg / #832226 text,
            alert-warning is #ffeecc bg / #855900 text. Ordered before the
            banner below, matching the real site (confirmed via a real
            screenshot of swimproject3.com/home). */}
        {alertList.length > 0 && <DismissibleAlerts alerts={alertList} />}

        {/* Header banner */}
        <div className="-mx-8 mb-8 bg-gradient-to-r from-[#D6336C] to-[#6B21A8] px-8 py-6">
          <h1 className="font-display text-xl font-semibold text-white">
            Smart Water Infrastructure Monitoring &amp; Decision Support System
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Real-time Water Management Dashboard with Honest System Reporting
          </p>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          <StatCard label="Total Sensors" value={total} />
          <StatCard label="Online Sensors" value={online} good={online > 0} />
          <StatCard label="Total Flow (m³)" value={totalFlow.toFixed(1)} />
          <StatCard label="Avg Pressure" value={avgPressure} />
          <StatCard label="Water Quality pH" value={phReading ? Number(phReading.value).toFixed(1) : "0.0"} />
          <StatCard label="System Status" value={systemStatus} critical={systemStatus === "Critical"} />
        </div>

        {/* Key Parameters — now driven by the real evaluateMetric
            thresholds (see bucketQuality/overallVerdict above) instead of
            the reading's own optimal_min/optimal_max columns, which the
            live DTUIP sync never populates. */}
        {phReading && (
          <div className="mt-8 rounded-xl bg-white/5 p-6">
            <h3 className="font-display text-base font-semibold text-mist">Key Parameters</h3>
            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
              <span className="text-sm text-mist/70">PH</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg text-mist">{Number(phReading.value).toFixed(1)} pH</span>
                <span className={metricStatusClass(evaluateMetric("ph", Number(phReading.value)).status)}>
                  {evaluateMetric("ph", Number(phReading.value)).status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Health / Quality / Leak panels */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Panel title="System Health Score">
            <div className="flex flex-col items-center py-4">
              <HealthRing score={healthScore} />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-mist/50">{healthGrade}</p>
              <p className="mt-2 text-center text-sm text-mist/60">
                {online === total && total > 0 ? "All systems reporting normally" : `System partially operational — ${online}/${total} sensors online`}
              </p>
              <div className="mt-4 w-full text-left">
                <h6 className="text-xs font-semibold uppercase tracking-wide text-mist/40">Recommendations</h6>
                <ul className="mt-2 space-y-1">
                  {healthRecommendations.map((rec) => (
                    <li key={rec} className="text-xs text-mist/60">
                      • {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>

          <Panel title="Groundwater Quality Assessment">
            <p className="text-xs text-mist/50">Data Source: Groundwater Monitoring Well</p>
            <p className="mt-2 font-mono text-sm text-mist">
              {wellVerdict.status === "unknown" ? wellVerdict.label : `${wellVerdict.label}${waterQuality.score != null ? ` (${waterQuality.score}/100)` : ""}`}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-xs text-mist/50">Contamination Risk</p>
                <span className={clsx("mt-1 inline-block", riskBadgeClass(contaminationRisk))}>{contaminationRisk}</span>
              </div>
              <div>
                <p className="text-xs text-mist/50">Health Risk</p>
                <span className={clsx("mt-1 inline-block", riskBadgeClass(healthRisk))}>{healthRisk}</span>
              </div>
            </div>
            <div className="mt-4 w-full text-left">
              <h6 className="text-xs font-semibold uppercase tracking-wide text-mist/40">Recommendations</h6>
              <ul className="mt-2 space-y-1">
                {wellQualityRecommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-mist/60">• {rec}</li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Leak Detection Status">
            <div className="py-2 text-center">
              <p className={clsx("font-mono text-lg", leakStatusTone[leakRollup.status].text)}>
                {leakStatusTone[leakRollup.status].label}
              </p>
              <p className="mt-1 text-xs text-mist/50">{leakRollup.message}</p>
              {flaggedPressureSensors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-left text-xs text-mist/60">
                  {flaggedPressureSensors.map(({ device, assessment }) => (
                    <li key={device.id}>
                      • {device.name ?? "Sensor"}: {assessment.message}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-mist/50">Online Pressure Sensors: {pressureOnlineCount} / {pressureDevices.length}</p>
              <p className="text-xs text-mist/50">Online Flow Meters: {flowOnlineCount} / {meterDevices.length}</p>
            </div>
          </Panel>
        </div>

        {/* Water / Reservoir Quality Distribution — doughnut charts, built
            from the same real evaluateMetric thresholds used everywhere
            else on this page now. */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Panel title="Water Quality Distribution" subtitle="Groundwater Monitoring Well Sensors">
            <QualityDonut distribution={wellDistribution} label="well" />
          </Panel>
          <Panel title="Reservoir Quality Distribution" subtitle="Water Reservoir Sensors">
            <QualityDonut distribution={reservoirDistribution} label="reservoir" />
          </Panel>
        </div>

        {/* Reservoir Water Quality Assessment */}
        <div className="mt-8 rounded-xl bg-white/5 p-6">
          <h3 className="font-display text-base font-semibold text-mist">Reservoir Water Quality Assessment</h3>
          {reservoirVerdict.status === "unknown" ? (
            <p className="mt-4 text-center text-sm text-mist/50">Cannot assess — no reservoir readings yet.</p>
          ) : (
            <div className="mt-4">
              <div className="text-center">
                <p
                  className={clsx(
                    "font-display text-lg font-semibold",
                    reservoirVerdict.status === "optimal" && "text-moss-light",
                    reservoirVerdict.status === "warning" && "text-amber-400",
                    (reservoirVerdict.status === "critical" || reservoirVerdict.status === "emergency") && "text-clay-light"
                  )}
                >
                  {reservoirVerdict.label.toUpperCase()}
                </p>
                <span className={clsx("mt-1 inline-block", riskBadgeClass(reservoirContaminationRisk))}>
                  {reservoirContaminationRisk === "Low" ? "SAFE FOR USE" : reservoirContaminationRisk === "Moderate" ? "MONITOR CLOSELY" : "UNSAFE FOR USE"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-xs text-mist/50">Contamination Risk</p>
                  <span className={clsx("mt-1 inline-block", riskBadgeClass(reservoirContaminationRisk))}>{reservoirContaminationRisk}</span>
                </div>
                <div>
                  <p className="text-xs text-mist/50">Treatment Needed</p>
                  <span
                    className={clsx(
                      "mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase",
                      reservoirTreatmentNeeded === "None" ? "bg-white/10 text-mist/60" : "bg-clay text-white"
                    )}
                  >
                    {reservoirTreatmentNeeded}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <h6 className="text-xs font-semibold uppercase tracking-wide text-mist/40">Key Parameters</h6>
                <div className="mt-3 space-y-2">
                  {reservoirMetrics
                    .filter(({ metric }) => QUALITY_METRICS.includes(metric))
                    .map(({ metric, reading }) => {
                      const evaluated = evaluateMetric(metric, Number(reading.value));
                      return (
                        <div key={metric} className="flex items-center justify-between border-t border-white/5 pt-2 text-sm">
                          <span className="text-mist/60">{wellMetricLabels[metric] ?? metric}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-mist">
                              {Number(reading.value).toFixed(2)} {evaluated.unit || reading.unit}
                            </span>
                            <span className={metricStatusClass(evaluated.status)}>{evaluated.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  {reservoirMetrics.filter(({ metric }) => QUALITY_METRICS.includes(metric)).length === 0 && (
                    <p className="text-xs text-mist/40">No quality readings yet — run /api/sync/dtuip-reservoir.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 w-full text-left">
                <h6 className="text-xs font-semibold uppercase tracking-wide text-mist/40">Recommendations</h6>
                <ul className="mt-2 space-y-1">
                  {reservoirRecommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-mist/60">• {rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {reservoirStatus && (
          <div className="mt-10">
            <ReservoirDecisionCard status={reservoirStatus} compact />
          </div>
        )}

        {/* Pressure Sensors Monitoring — real semicircle gauges instead of
            plain numbers, matching the old site's dial-style presentation. */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">
            Pressure Sensors Monitoring
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {pressureDevices.map((d) => {
              const r = readingFor(d.id);
              const isOnline = d.status === "online";
              return (
                <div key={d.id} className="rounded-xl bg-white/5 p-5 text-center">
                  <p className="text-sm font-medium text-mist">{d.name}</p>
                  <PressureGauge value={r ? Number(r.value) : 0} max={10} online={isOnline} />
                  <p className={clsxStatus(d.status)}>{d.status}</p>
                  {r?.recorded_at && (
                    <p className="mt-1 text-[11px] text-mist/40">
                      Last updated:{" "}
                      {new Date(r.recorded_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Pressure Values — bar chart of currently-online sensors
            only. Matches the live site's "honest labeling" behavior:
            offline sensors are excluded rather than shown as 0, since a
            0 bar reading and an offline sensor mean different things. */}
        <div className="mt-8 rounded-xl bg-white/5 p-6">
          <h3 className="font-display text-base font-semibold text-mist">
            {pressureChartData.length === 0 ? "Pressure Sensor Status — All Offline" : "Current Pressure Values"}
          </h3>
          <div className="mt-4">
            <SimpleBarChart
              data={pressureChartData}
              color="#0090e7"
              unit="bar"
              emptyMessage="All pressure sensors are currently offline."
            />
          </div>
        </div>

        {/* System Maintenance Recommendations */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">
            System Maintenance Recommendations
          </h2>
          {alertList.length === 0 ? (
            <p className="mt-4 rounded-xl bg-white/5 p-6 text-center text-sm text-mist/50">
              No active maintenance recommendations. All monitored systems reporting normally.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {alertList.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>

        {/* Ground Water Monitoring Well — one card PER METRIC now,
            since the well is a single device with several metrics. */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">
            Ground Water Monitoring Well
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {wellMetrics.map(({ metric, reading }) => {
              const evaluated = evaluateMetric(metric, Number(reading.value));
              const range = SENSOR_CONFIGS[metric]?.optimal;
              return (
                <div key={metric} className="rounded-xl bg-white/5 p-5">
                  <p className={metricValueColorClass(evaluated.status)}>{Number(reading.value).toFixed(2)}</p>
                  <p className="mt-1 text-sm text-mist">{wellMetricLabels[metric] ?? metric}</p>
                  <p className="text-xs text-mist/50">{evaluated.unit || reading.unit || "—"}</p>
                  {wellDevice && <p className={clsxStatus(wellDevice.status)}>{wellDevice.status}</p>}
                  <p className="mt-1 text-xs text-mist/50">Status: {evaluated.status === "unknown" ? "Unknown" : evaluated.status.charAt(0).toUpperCase() + evaluated.status.slice(1)}</p>
                  {range && (
                    <p className="mt-1 text-xs text-river-light">
                      Optimal: {range[0]} - {range[1]} {evaluated.unit}
                    </p>
                  )}
                  <span className={clsx("mt-2 inline-block", metricStatusClass(evaluated.status))}>{evaluated.status}</span>
                </div>
              );
            })}
            {wellMetrics.length === 0 && (
              <p className="col-span-full text-center text-sm text-mist/50">No readings yet.</p>
            )}
          </div>
        </div>

        {/* Groundwater Reservoir — a separate real device from the Well
            (see lib/dtuip-reservoir/client.ts for how this was confirmed). */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">
            Groundwater Reservoir
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {reservoirMetrics.map(({ metric, reading }) => {
              const evaluated = evaluateMetric(metric, Number(reading.value));
              const range = SENSOR_CONFIGS[metric]?.optimal;
              return (
                <div key={metric} className="rounded-xl bg-white/5 p-5">
                  <p className={metricValueColorClass(evaluated.status)}>
                    {Number(reading.value).toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm text-mist">{wellMetricLabels[metric] ?? metric}</p>
                  <p className="text-xs text-mist/50">{evaluated.unit || reading.unit || "—"}</p>
                  {reservoirDevice && <p className={clsxStatus(reservoirDevice.status)}>{reservoirDevice.status}</p>}
                  <p className="mt-1 text-xs text-mist/50">Status: {evaluated.status === "unknown" ? "Unknown" : evaluated.status.charAt(0).toUpperCase() + evaluated.status.slice(1)}</p>
                  {range && (
                    <p className="mt-1 text-xs text-river-light">
                      Optimal: {range[0]} - {range[1]} {evaluated.unit}
                    </p>
                  )}
                  <span className={clsx("mt-2 inline-block", metricStatusClass(evaluated.status))}>{evaluated.status}</span>
                </div>
              );
            })}
            {reservoirMetrics.length === 0 && (
              <p className="col-span-full text-center text-sm text-mist/50">No readings yet — run /api/sync/dtuip-reservoir.</p>
            )}
          </div>
        </div>

        {/* Water Reservoir Monitoring — capacity %, computed against the
            project's own calibrated RESERVOIR_CONFIG.maxLevelM (5.0m for
            the 100 m³ reservoir) rather than a generic optimal-range guess.
            The live site shows a Main/Backup split; this schema only has 1
            reservoir device (GWRES-01) so only 1 card renders. */}
        {reservoirDevice && (
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-mist">Water Reservoir Monitoring</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-mist/60">Reservoir System</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-white/5 p-5">
                <p
                  className={clsx(
                    "font-mono text-2xl font-semibold",
                    reservoirCapacityPct == null
                      ? "text-mist/40"
                      : reservoirCapacityPct >= 50
                      ? "text-moss-light"
                      : "text-amber-400"
                  )}
                >
                  {reservoirCapacityPct == null ? "—" : `${reservoirCapacityPct}%`}
                </p>
                <p className="mt-1 text-sm text-mist">{reservoirDevice.name}</p>
                {latestReservoirLevel != null && (
                  <p className="text-xs text-mist/50">
                    {latestReservoirLevel.toFixed(2)}m of {RESERVOIR_CONFIG.maxLevelM}m max
                  </p>
                )}
                {reservoirLevelHistory[0]?.recorded_at && (
                  <p className="mt-1 text-[11px] text-mist/40">
                    Last updated: {new Date(reservoirLevelHistory[0].recorded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
                <p className={clsxStatus(reservoirDevice.status)}>{reservoirDevice.status}</p>
              </div>
            </div>
          </div>
        )}

        {/* Recharge Decision Support — real rule-based logic ported from
            the recovered DSS script, not a generic score. */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">
            Recharge Decision Support
          </h2>
          <div className="mt-4 rounded-xl bg-white/5 p-6">
            <p
              className={
                rechargeAnalysis.decision === "DO NOT RECHARGE"
                  ? "text-2xl font-bold text-clay"
                  : rechargeAnalysis.decision === "RECHARGE URGENTLY"
                  ? "text-2xl font-bold text-amber-400"
                  : rechargeAnalysis.decision === "RECHARGE NOW"
                  ? "text-2xl font-bold text-moss"
                  : "text-2xl font-bold text-mist"
              }
            >
              {rechargeAnalysis.decision}
            </p>
            <p className="mt-1 text-sm text-mist/60">
              Confidence: {rechargeAnalysis.confidence} · Pump status: {pumpInference.status}
            </p>
            <p className="mt-3 text-sm text-mist">{rechargeAnalysis.recommendedAction}</p>
            {rechargeAnalysis.reasons.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-mist/50">
                {rechargeAnalysis.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Rainfall Analysis — plain-language summary, 7-day forecast, hour by
            hour, last 30 days, month vs normal and last 12 months (Open-Meteo).
            Independent of MIKE and of any sensor hardware. */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">Rainfall Analysis</h2>
          <RainfallPanel report={rainfall} />
        </div>

        {/* Water Flow Status / Sensor Connectivity Status */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Panel title="Water Flow Status" subtitle="Smart Meter Current Readings">
            <SimpleBarChart
              data={flowChartData}
              color="#17a2b8"
              unit="m³"
              emptyMessage="All smart meters are currently offline."
            />
          </Panel>
          <Panel title="Sensor Connectivity Status">
            <ConnectivityPie online={online} offline={total - online} />
          </Panel>
        </div>

        {/* Smart Water Meters — the live site shows real cURL connection
            errors here (server unreachable, etc.). devices.last_error now
            persists that text (written by app/api/sync/watermeter/route.ts
            on a failed sync), so it's shown for real instead of being left
            out. */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-mist">Smart Water Meters</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {meterDevices.map((d) => {
              const r = readingFor(d.id);
              const cumulativeHistory = allReadings
                .filter((row) => row.device_id === d.id && row.metric === "flow_total")
                .map((row) => ({ value: Number(row.value), recorded_at: row.recorded_at }));
              const voltageHistory = allReadings
                .filter((row) => row.device_id === d.id && row.metric === "battery_voltage")
                .map((row) => ({ value: Number(row.value), recorded_at: row.recorded_at }));
              const realtime = assessMeterRealtime({
                isReachable: !d.last_error,
                cumulativeFlow: cumulativeHistory[0]?.value ?? null,
                voltage: d.battery_pct,
                communicationTime: d.last_update,
              });
              const history = assessMeterHistory(cumulativeHistory, voltageHistory);
              return (
                <div key={d.id} className="rounded-xl bg-white/5 p-5 text-center">
                  <p className="font-mono text-2xl font-semibold text-mist">
                    {r ? Number(r.value).toFixed(2) : "0.00"}
                  </p>
                  <p className="mt-1 text-xs text-mist/50">{d.name}</p>
                  <p className={clsxStatus(d.status)}>{d.status}</p>
                  {/* Real per-meter DSS verdict, ported from SM#AnalyzeMeterDecisionSupport.py
                      (lib/waterMeterDSS.ts) — richer than the plain online/offline
                      status above (e.g. distinguishes a meter that's reachable but
                      stuck reporting zero from one that's truly unreachable). */}
                  <p className={clsx("mt-2 text-[11px] font-semibold", meterStatusTone[realtime.status])}>
                    {METER_STATUS_LABEL[realtime.status]}
                  </p>
                  {history.analysisPerformed && (
                    <p className="mt-0.5 text-[10px] text-mist/40">DSS health: {history.healthScore}/100</p>
                  )}
                  {d.last_error && (
                    <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] leading-snug text-red-300" title={d.last_error}>
                      {d.last_error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function clsxStatus(status: string) {
  return status === "online"
    ? "mt-2 text-xs font-mono uppercase tracking-wide text-moss-light"
    : "mt-2 text-xs font-mono uppercase tracking-wide text-clay-light";
}

const meterStatusTone: Record<MeterSystemStatus, string> = {
  ONLINE: "text-moss-light",
  ZERO_READING: "text-mist/50",
  STALE_DATA: "text-amber-400",
  STUCK_AT_ZERO: "text-red-400",
  API_ERROR: "text-red-400",
  NO_DATA: "text-purple-400",
  UNKNOWN: "text-mist/40",
};

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.08] p-6">
      <h3 className="font-display text-base font-semibold text-mist">{title}</h3>
      {subtitle && <p className="mt-1 text-center text-xs text-mist/50">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  good,
  critical,
}: {
  label: string;
  value: string | number;
  good?: boolean;
  critical?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-5">
      <p
        className={
          critical
            ? "font-mono text-2xl font-semibold text-clay"
            : good
            ? "font-mono text-2xl font-semibold text-moss-light"
            : "font-mono text-2xl font-semibold text-mist"
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-mist/50">{label}</p>
    </div>
  );
}