// Real per-meter Decision Support System — ported from the recovered
// IronPython scripts script/smartmeter/sm{1..4}/SM{N}AnalyzeMeterDecisionSupport.py
// (see MIKE_SCRIPTS_REFERENCE.md). All 4 meters ran the identical logic
// against their own meter ID, so this is one shared implementation rather
// than 4 near-duplicate copies.
//
// WHAT'S PORTED (exact, same thresholds as the real script):
//   - analyze_real_time_meter_status(): the live system_status
//     classification (ONLINE / ZERO_READING / STALE_DATA / STUCK_AT_ZERO /
//     API_ERROR / NO_DATA), based on how old CommunicationTime is and
//     whether the cumulative reading is zero. Same day thresholds (7/30/90).
//   - The cumulative-volume trend + "stuck at zero" pattern check from
//     perform_historical_analysis(): compares the average of the newest
//     half of readings against the older half, and flags it if the last 10
//     readings are >=80% zero. Uses this project's own sensor_readings
//     history for the meter's `flow_total` metric, which has been
//     accumulating for real since app/api/sync/watermeter/route.ts started
//     running — same shape of data as the original script's cumulative_ts,
//     just sourced from Supabase instead of a MIKE time series.
//   - The battery trend/low-voltage checks from the same function, using
//     this project's `battery_voltage` metric history (added 2026-09-23
//     alongside this file — see the sync route).
//
// WHAT'S DELIBERATELY NOT PORTED (said plainly, not faked):
//   - Daily-consumption-pattern analysis (needs a separate day-bucketed
//     time series the original MIKE project kept; we don't have an
//     equivalent series here).
//   - Valve-status history analysis (ValveStatus is in the raw API
//     response but isn't currently stored as its own sensor_readings
//     metric, so there's no history to analyze yet).
//   - The original's "coverage ratio" data-quality score, which measured
//     gaps against a MIKE time series' expected sample rate — not a
//     meaningful concept against our own accumulating history in the same
//     way, so the health score below is a simplified analog, not a
//     byte-for-byte port of that one part.

export type MeterSystemStatus =
  | "ONLINE"
  | "ZERO_READING"
  | "STALE_DATA"
  | "STUCK_AT_ZERO"
  | "API_ERROR"
  | "NO_DATA"
  | "UNKNOWN";

export interface MeterRealtimeAssessment {
  status: MeterSystemStatus;
  dataAgeDays: number | null;
  alerts: string[];
}

/**
 * Direct port of analyze_real_time_meter_status(). `isReachable=false`
 * means this sync's API call itself failed (mirrors the script's
 * API_ERROR branch); otherwise pass the meter's latest known reading.
 */
export function assessMeterRealtime(params: {
  isReachable: boolean;
  cumulativeFlow: number | null;
  voltage: number | null;
  communicationTime: string | null;
}): MeterRealtimeAssessment {
  const alerts: string[] = [];

  if (!params.isReachable) {
    return { status: "API_ERROR", dataAgeDays: null, alerts: ["Network/connection error reaching the meter API"] };
  }
  if (params.communicationTime == null || params.cumulativeFlow == null) {
    return { status: "NO_DATA", dataAgeDays: null, alerts: ["No meter data in API response"] };
  }

  const commTime = new Date(params.communicationTime).getTime();
  if (Number.isNaN(commTime)) {
    return { status: "NO_DATA", dataAgeDays: null, alerts: ["Unparseable CommunicationTime"] };
  }

  const dataAgeDays = (Date.now() - commTime) / (1000 * 60 * 60 * 24);
  const cumulative = params.cumulativeFlow;

  let status: MeterSystemStatus;
  if (dataAgeDays > 90) {
    status = cumulative === 0 ? "STUCK_AT_ZERO" : "STALE_DATA";
    alerts.push(`CRITICAL: Meter data ${dataAgeDays.toFixed(1)} days old`);
  } else if (dataAgeDays > 30) {
    status = "STALE_DATA";
    alerts.push(`URGENT: Meter data ${dataAgeDays.toFixed(1)} days old`);
  } else if (dataAgeDays > 7) {
    status = "STALE_DATA";
    alerts.push(`Meter data ${dataAgeDays.toFixed(1)} days old`);
  } else if (cumulative === 0) {
    status = "ZERO_READING";
    alerts.push("Current reading: 0.0 m³");
  } else {
    status = "ONLINE";
    alerts.push(`Meter online — Reading: ${cumulative} m³`);
  }

  if (params.voltage != null && params.voltage < 3.5) {
    alerts.push(`Low battery: ${params.voltage}V`);
  }

  return { status, dataAgeDays, alerts };
}

export interface MeterHistoricalAssessment {
  healthScore: number; // 0-100, clamped
  alerts: string[];
  analysisPerformed: boolean;
}

/**
 * Port of the cumulative-volume + battery portions of
 * perform_historical_analysis(). Both histories should be all past
 * readings for this device's metric, in any order (sorted internally).
 */
export function assessMeterHistory(
  cumulativeHistory: Array<{ value: number; recorded_at: string }>,
  voltageHistory: Array<{ value: number; recorded_at: string }>,
): MeterHistoricalAssessment {
  const alerts: string[] = [];
  let healthScore = 0;

  // Same "not worth analyzing yet" floor as the original script (it used
  // 10 combined data points across 4 series; here it's just the one
  // cumulative series, so the bar is a bit lower).
  if (cumulativeHistory.length < 5 && voltageHistory.length < 5) {
    return { healthScore: 0, alerts: ["Insufficient historical data for meaningful analysis"], analysisPerformed: false };
  }

  // --- Cumulative volume trend (mirrors cumulative_ts analysis) ---
  if (cumulativeHistory.length > 20) {
    healthScore += 30; // baseline for having enough data, standing in for the original's coverage-ratio score

    const sorted = [...cumulativeHistory].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );

    const recent = sorted.slice(-10);
    const zeroCount = recent.filter((r) => r.value === 0).length;
    if (zeroCount >= 8) {
      alerts.push("Historical pattern: Meter frequently shows zero readings");
      healthScore -= 20;
    }

    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    if (firstHalf.length && secondHalf.length) {
      const avgFirst = firstHalf.reduce((s, r) => s + r.value, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, r) => s + r.value, 0) / secondHalf.length;
      if (avgSecond > avgFirst * 1.1) {
        alerts.push("Positive trend: Consumption increasing");
        healthScore += 10;
      } else if (avgSecond < avgFirst * 0.9) {
        alerts.push("Negative trend: Consumption decreasing");
        healthScore -= 10;
      }
    }
  } else if (cumulativeHistory.length > 0) {
    alerts.push("Limited historical data available — trends may not be reliable yet");
  }

  // --- Battery trend (mirrors battery_ts analysis) ---
  const voltages = voltageHistory.filter((r) => r.value > 0);
  if (voltages.length >= 20) {
    healthScore += 30;
    const sorted = [...voltages].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    const minVoltage = Math.min(...sorted.map((r) => r.value));
    if (minVoltage < 3.5) {
      alerts.push("Historical pattern: Frequent low battery events");
      healthScore -= 15;
    }
    const quarter = Math.max(1, Math.floor(sorted.length / 4));
    const firstQuarter = sorted.slice(0, quarter);
    const lastQuarter = sorted.slice(-quarter);
    const avgFirst = firstQuarter.reduce((s, r) => s + r.value, 0) / firstQuarter.length;
    const avgLast = lastQuarter.reduce((s, r) => s + r.value, 0) / lastQuarter.length;
    if (avgLast < avgFirst * 0.9) {
      alerts.push("Negative trend: Battery voltage declining over time");
      healthScore -= 10;
    }
  }

  return {
    healthScore: Math.max(0, Math.min(100, healthScore)),
    alerts,
    analysisPerformed: true,
  };
}

export const METER_STATUS_LABEL: Record<MeterSystemStatus, string> = {
  ONLINE: "Online",
  ZERO_READING: "Online — zero flow",
  STALE_DATA: "Stale data",
  STUCK_AT_ZERO: "Stuck at zero (critical)",
  API_ERROR: "Connection error",
  NO_DATA: "No data",
  UNKNOWN: "Unknown",
};