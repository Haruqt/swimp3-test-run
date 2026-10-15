// lib/decisionSupport.ts
//
// Core logic for the Decision Support System: threshold evaluation, trend
// detection, rule-based recommendations, and live alert generation.
// Grounded in the SWIM project's actual stated objectives (see project
// poster): reduce distribution losses (13% -> 2%), reduce contamination
// risk, and support operational decisions the way MIKE Operations is meant
// to.

import type { Alert, AlertSeverity, Device, SensorReading } from "./types";

export type ThresholdStatus = "normal" | "warning" | "critical";

export interface ThresholdEvaluation {
  status: ThresholdStatus;
  message: string;
}

// A reading within the optimal range is "normal". Outside it but within a
// 10% buffer is "warning" (drifting). Beyond that buffer is "critical".
export function evaluateThreshold(
  value: number,
  optimalMin: number | null,
  optimalMax: number | null
): ThresholdEvaluation {
  if (optimalMin == null || optimalMax == null) {
    return { status: "normal", message: "No defined safe range for this metric yet." };
  }
  const range = optimalMax - optimalMin;
  const buffer = range * 0.1;

  if (value < optimalMin - buffer || value > optimalMax + buffer) {
    return {
      status: "critical",
      message: `Significantly outside the safe range (${optimalMin}-${optimalMax}).`,
    };
  }
  if (value < optimalMin || value > optimalMax) {
    return {
      status: "warning",
      message: `Outside the safe range (${optimalMin}-${optimalMax}), but not severely.`,
    };
  }
  return { status: "normal", message: "Within the safe operating range." };
}

export interface QualityDistribution {
  optimal: number;
  warning: number;
  critical: number;
  offline: number;
}

export interface TrendResult {
  direction: "rising" | "falling" | "stable";
  percentChange: number;
}

// Compares the earliest vs latest reading in a set. A change under 3%
// counts as "stable" to avoid noise from sensor jitter.
export function computeTrend(
  readings: { value: number | string; recorded_at: string }[]
): TrendResult | null {
  if (readings.length < 2) return null;
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const first = Number(sorted[0].value);
  const last = Number(sorted[sorted.length - 1].value);

  if (first === 0) {
    return { direction: last === 0 ? "stable" : last > 0 ? "rising" : "falling", percentChange: 0 };
  }
  const percentChange = ((last - first) / Math.abs(first)) * 100;
  const direction = Math.abs(percentChange) < 3 ? "stable" : percentChange > 0 ? "rising" : "falling";
  return { direction, percentChange };
}

interface RecommendationContext {
  metric: string;
  groupType: string;
  status: ThresholdStatus;
  trend: TrendResult | null;
}

const QUALITY_METRICS = ["ph", "turbidity", "tds", "conductivity", "salinity", "chlorine"];

// Rule-based recommendations. Each branch ties back to a specific stated
// project objective rather than giving generic "value is off" advice.
export function getRecommendation(ctx: RecommendationContext): string {
  const { metric, groupType, status, trend } = ctx;

  if (status === "normal") {
    return "No action needed — readings are within the safe operating range.";
  }

  // Pressure -> distribution-loss reduction target (13% -> 2%)
  if (groupType === "pressure") {
    if (trend?.direction === "falling") {
      return "A sustained pressure drop can indicate a pipeline leak. Since reducing distribution losses is a core project target, recommend a field inspection at this sensor's location within 24 hours.";
    }
    return status === "critical"
      ? "Pressure is critically out of range. Inspect for line breaks, valve failures, or pump malfunction immediately."
      : "Pressure is trending outside the normal range. Schedule a routine inspection.";
  }

  // Groundwater well/reservoir -> contamination + environmental objectives
  if (groupType === "groundwater_well" || groupType === "groundwater_reservoir") {
    if (QUALITY_METRICS.includes(metric)) {
      return status === "critical"
        ? `${metric.toUpperCase()} indicates a contamination risk. Recommend halting distribution from this source and testing before it reaches consumers.`
        : `${metric.toUpperCase()} is drifting outside the safe range. Recommend increased monitoring frequency and a water treatment check.`;
    }
    if (metric === "level") {
      return status === "critical"
        ? "Storage level is critically low. Recommend activating backup supply or temporary usage restrictions to avoid service interruption."
        : "Storage level is trending low. Monitor closely and plan for replenishment.";
    }
  }

  // Smart water meters -> non-revenue water / distribution efficiency
  if (groupType === "smart_water_meter") {
    return "Unusual flow reading detected. Cross-check against nearby pressure sensors to rule out a leak before assuming meter malfunction.";
  }

  return "Reading is outside its expected range. Recommend manual review.";
}

// A 0-100 score: 100 at the exact midpoint of the optimal range, ~70 right
// at the edge of "still optimal", tapering to 0 the further outside it a
// reading drifts. Returns null when no optimal range is defined (so callers
// can render "Unknown" instead of a fabricated number).
export function computeQualityScore(
  value: number,
  optimalMin: number | null,
  optimalMax: number | null
): number | null {
  if (optimalMin == null || optimalMax == null) return null;
  const mid = (optimalMin + optimalMax) / 2;
  const halfRange = (optimalMax - optimalMin) / 2;
  if (halfRange === 0) return value === mid ? 100 : 0;

  const deviation = Math.abs(value - mid) / halfRange; // 0 at center, 1 at the edge
  if (deviation <= 1) return Math.round(100 - deviation * 30);
  const overshoot = deviation - 1;
  return Math.max(0, Math.round(70 - overshoot * 70));
}

export function qualityLabel(score: number | null): string {
  if (score == null) return "Unknown";
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

// Device-wide water quality: averages the quality score across every
// water-quality metric this device reports (pH, turbidity, TDS,
// conductivity, salinity) rather than just whichever single metric the
// person happens to have selected in the UI.
export function overallDeviceQuality(
  readingsByMetric: Map<string, SensorReading[]>
): { label: string; score: number | null; metricsUsed: number } {
  const scores: number[] = [];
  for (const metric of QUALITY_METRICS) {
    const readings = readingsByMetric.get(metric);
    const latest = readings?.[readings.length - 1];
    if (!latest) continue;
    const score = computeQualityScore(Number(latest.value), latest.optimal_min, latest.optimal_max);
    if (score != null) scores.push(score);
  }
  if (scores.length === 0) return { label: "Unknown", score: null, metricsUsed: 0 };
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { label: qualityLabel(avg), score: avg, metricsUsed: scores.length };
}

function severityFor(status: ThresholdStatus, trend: TrendResult | null): AlertSeverity {
  if (status === "critical") return trend?.direction !== "stable" ? "emergency" : "immediate";
  return "medium";
}

function titleFor(metricLabel: string, deviceName: string): string {
  return `${metricLabel} anomaly — ${deviceName}`;
}

// Scans the latest reading per (device, metric) pair and generates real
// Alert objects for anything outside its optimal range — these are meant
// to be merged with whatever's manually seeded in the `alerts` table, not
// replace it. Each carries a stable synthetic id so it doesn't collide
// with real DB alert ids.
export function generateLiveAlerts(
  devices: Device[],
  allReadings: SensorReading[],
  metricLabels: Record<string, string> = {}
): Alert[] {
  const deviceById = new Map(devices.map((d) => [d.id, d]));

  // Group all readings by device+metric so we can compute a trend, not
  // just look at the single latest value.
  const byKey = new Map<string, SensorReading[]>();
  for (const r of allReadings) {
    const key = `${r.device_id}::${r.metric}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  const alerts: Alert[] = [];

  for (const [key, readings] of byKey) {
    const [deviceId, metric] = key.split("::");
    const device = deviceById.get(deviceId);
    if (!device) continue;

    // readings may be in any order coming in; sort so "latest" is reliable.
    const sorted = [...readings].sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );
    const latest = sorted[0];
    const { status } = evaluateThreshold(Number(latest.value), latest.optimal_min, latest.optimal_max);
    if (status === "normal") continue;

    const trend = computeTrend(readings);
    const metricLabel = metricLabels[metric] ?? metric;
    const recommendation = getRecommendation({ metric, groupType: device.group_type, status, trend });

    alerts.push({
      id: `live-${key}`,
      title: titleFor(metricLabel, device.name ?? "Sensor"),
      description: `Latest reading: ${Number(latest.value)} ${latest.unit}${
        latest.optimal_min != null && latest.optimal_max != null
          ? ` (safe range ${latest.optimal_min}-${latest.optimal_max})`
          : ""
      }.`,
      root_cause:
        trend && trend.direction !== "stable"
          ? `Reading has been ${trend.direction} (${trend.percentChange.toFixed(1)}% change over the observed period).`
          : null,
      recommended_actions: [recommendation],
      severity: severityFor(status, trend),
      estimated_time: null,
      related_device_id: device.id,
      resolved: false,
      created_at: latest.recorded_at,
    });
  }

  return alerts;
}