// Reservoir prediction + decision matrix — TypeScript port of the MIKE
// Operations IronPython scripts' logic (thresholds copied from them), so the
// site can produce the same style of verdict on its own when MIKE is
// unreachable. When a fresh MIKE result has been ingested
// (/api/mike/ingest) the site prefers that and uses this as the fallback.

import { RESERVOIR_CONFIG } from "@/lib/waterQualityDSS";

export type Reliability = "RELIABLE" | "MODERATE" | "UNRELIABLE" | "NO DATA";
export type RainfallStatus = "CRITICAL DROUGHT" | "SEVERE DROUGHT" | "ABOVE NORMAL" | "NORMAL" | "UNKNOWN";
export type LevelDecision = "EMERGENCY" | "CAUTION" | "OVERFLOW RISK" | "STABLE";
export type CombinedDecision =
  | "DATA GAP OVERRIDE"
  | "VERIFIED ACTION REQUIRED"
  | "EMERGENCY OVERRIDE"
  | "CAUTION - STALE DATA"
  | LevelDecision;
export type RiskLevel = "CRITICAL" | "HIGH" | "ELEVATED" | "LOW" | "UNKNOWN";

export interface ReservoirAnalysis {
  analysis_timestamp: string;
  reservoir_level_m: number | null;
  level_data_age_days: number | null;
  level_data_timestamp: string | null;
  data_issue: string | null;
  rainfall_analysis: { percent_of_normal: number | null; status: RainfallStatus; note: string | null };
  prediction_analysis: {
    confidence: string;
    confidence_score: number;
    daily_change_m: number;
    uncertainty_m_per_day: number;
    min_current_m: number | null;
    max_current_m: number | null;
    operational_status: "CRITICAL" | "HIGH RISK" | "HIGH OVERFLOW RISK" | "NORMAL" | "NO DATA";
  };
  decision_matrix: {
    data_reliability: Reliability;
    reliability_score: number;
    level_decision: LevelDecision | "NO DATA";
    rainfall_decision: RainfallStatus;
    combined_decision: CombinedDecision | "DATA GAP OVERRIDE";
  };
  risk_assessment: { overall_status: string; risk_level: RiskLevel; primary_risk: string; recommended_action: string };
  source: "site";
}

const C = RESERVOIR_CONFIG;

function confidenceFor(age: number): { label: string; score: number } {
  if (age <= 1) return { label: "HIGH", score: 0.9 };
  if (age <= 2) return { label: "MEDIUM", score: 0.7 };
  if (age <= 3) return { label: "LOW", score: 0.4 };
  if (age <= 7) return { label: "VERY LOW", score: 0.2 };
  return { label: "UNRELIABLE", score: 0.1 };
}
function uncertaintyFor(age: number): number {
  if (age <= 1) return 0.05;
  if (age <= 2) return 0.15;
  if (age <= 3) return 0.2;
  return 0.3;
}
function dailyChangeFor(rainPct: number | null): number {
  if (rainPct == null) return 0;
  if (rainPct < 20) return -0.071;
  if (rainPct < 50) return -0.029;
  if (rainPct < 80) return -0.014;
  if (rainPct > 120) return 0.043;
  return 0;
}
export function rainStatusFor(rainPct: number | null): RainfallStatus {
  if (rainPct == null) return "UNKNOWN";
  if (rainPct < 20) return "CRITICAL DROUGHT";
  if (rainPct < 50) return "SEVERE DROUGHT";
  if (rainPct > 120) return "ABOVE NORMAL";
  return "NORMAL";
}
const clamp = (v: number) => Math.min(Math.max(v, 0), C.maxLevelM);

export function analyzeReservoir(input: {
  levelM: number | null;
  levelTimestamp: string | null;
  rainfallPct: number | null;
  rainfallNote?: string | null;
  now?: Date;
}): ReservoirAnalysis {
  const now = input.now ?? new Date();
  const base = { analysis_timestamp: now.toISOString(), source: "site" as const };
  const rainStatus = rainStatusFor(input.rainfallPct);
  const rainfall_analysis = { percent_of_normal: input.rainfallPct, status: rainStatus, note: input.rainfallNote ?? null };

  // Validation — same bounds as the MIKE script (< -10 invalid; negative = data issue).
  let level = input.levelM;
  let dataIssue: string | null = null;
  if (level != null && (!Number.isFinite(level) || level < -10)) {
    dataIssue = `Sensor value ${level} is an error code / invalid, not a real level.`;
    level = null;
  } else if (level != null && level > 50) {
    dataIssue = `Sensor value ${level} m is above the plausible maximum.`;
    level = null;
  } else if (level != null && level < 0) {
    dataIssue = `Negative level ${level} m — treated as 0 m but flagged as a sensor problem.`;
  }

  if (level == null || !input.levelTimestamp) {
    return {
      ...base,
      reservoir_level_m: null,
      level_data_age_days: null,
      level_data_timestamp: input.levelTimestamp,
      data_issue: dataIssue ?? "No reservoir level reading available.",
      rainfall_analysis,
      prediction_analysis: {
        confidence: "NONE", confidence_score: 0, daily_change_m: 0, uncertainty_m_per_day: 0,
        min_current_m: null, max_current_m: null, operational_status: "NO DATA",
      },
      decision_matrix: {
        data_reliability: "NO DATA", reliability_score: 0, level_decision: "NO DATA",
        rainfall_decision: rainStatus, combined_decision: "DATA GAP OVERRIDE",
      },
      risk_assessment: {
        overall_status: "DATA GAP OVERRIDE", risk_level: "UNKNOWN",
        primary_risk: "No usable reservoir level data.",
        recommended_action: "Check the level sensor / sync (/api/sync/dtuip-reservoir) before making any pumping decision.",
      },
    };
  }

  const ageDays = Math.max(0, (now.getTime() - new Date(input.levelTimestamp).getTime()) / 86_400_000);
  const conf = confidenceFor(ageDays);
  const dailyChange = dailyChangeFor(input.rainfallPct);
  const unc = uncertaintyFor(ageDays);
  const lvl = Math.max(level, 0);
  const minCur = clamp(lvl + dailyChange * ageDays - unc * ageDays);
  const maxCur = clamp(lvl + dailyChange * ageDays + unc * ageDays);

  let opStatus: ReservoirAnalysis["prediction_analysis"]["operational_status"] = "NORMAL";
  if (minCur < C.emergencyMinM || (input.rainfallPct != null && input.rainfallPct < 20)) opStatus = "CRITICAL";
  else if (minCur < C.optimalRechargeMinM || (input.rainfallPct != null && input.rainfallPct < 50)) opStatus = "HIGH RISK";
  else if (minCur > C.overflowLevelM && dailyChange > 0) opStatus = "HIGH OVERFLOW RISK";

  const reliability: Reliability = ageDays <= 1 ? "RELIABLE" : ageDays <= 2 ? "MODERATE" : "UNRELIABLE";
  const relScore = ageDays <= 1 ? 1.0 : ageDays <= 2 ? 0.7 : 0.1;

  const levelDecision: LevelDecision =
    lvl < C.emergencyMinM ? "EMERGENCY" : lvl < C.optimalRechargeMinM ? "CAUTION" : lvl > C.overflowLevelM ? "OVERFLOW RISK" : "STABLE";

  let combined: CombinedDecision;
  if (ageDays > 2 && (levelDecision === "EMERGENCY" || rainStatus === "CRITICAL DROUGHT")) combined = "VERIFIED ACTION REQUIRED";
  else if (levelDecision === "EMERGENCY" || rainStatus === "CRITICAL DROUGHT") combined = "EMERGENCY OVERRIDE";
  else if (reliability !== "RELIABLE") combined = "CAUTION - STALE DATA";
  else combined = levelDecision;

  // Site's own mapping from decision → risk level / wording (the MIKE script's exact text is not reproduced).
  const age = ageDays.toFixed(1);
  let risk: RiskLevel;
  let primary: string;
  let action: string;
  switch (combined) {
    case "VERIFIED ACTION REQUIRED":
      risk = "CRITICAL";
      primary = `Level reading is ${age} days old and indicates ${levelDecision === "EMERGENCY" ? "an emergency low" : "drought conditions"}.`;
      action = "Verify the reservoir level on site now (sensor may be stale or faulty), then act on the verified value.";
      break;
    case "EMERGENCY OVERRIDE":
      risk = "CRITICAL";
      primary = levelDecision === "EMERGENCY" ? `Level ${lvl.toFixed(2)} m is below the ${C.emergencyMinM} m emergency minimum.` : "Rainfall is critically below normal.";
      action = "Stop draw-down, conserve water, and prepare recharge / alternative supply.";
      break;
    case "CAUTION - STALE DATA":
      risk = "ELEVATED";
      primary = `Data is ${age} days old (${reliability}); true level is somewhere in ${minCur.toFixed(2)}–${maxCur.toFixed(2)} m.`;
      action = "Refresh the level reading before relying on this decision.";
      break;
    case "CAUTION":
      risk = "HIGH";
      primary = `Level ${lvl.toFixed(2)} m is below the ${C.optimalRechargeMinM} m optimal-recharge minimum.`;
      action = `Limit pumping and wait for the level to rise above ${C.optimalRechargeMinM} m before recharging.`;
      break;
    case "OVERFLOW RISK":
      risk = "HIGH";
      primary = `Level ${lvl.toFixed(2)} m is above the ${C.overflowLevelM} m overflow threshold.`;
      action = "Stop recharge / inflow and draw the reservoir down.";
      break;
    default:
      risk = "LOW";
      primary = "Level within the normal operating band.";
      action = "No action required. Continue routine monitoring.";
  }
  if (dataIssue) primary += ` ${dataIssue}`;

  return {
    ...base,
    reservoir_level_m: level,
    level_data_age_days: Number(ageDays.toFixed(2)),
    level_data_timestamp: input.levelTimestamp,
    data_issue: dataIssue,
    rainfall_analysis,
    prediction_analysis: {
      confidence: conf.label, confidence_score: conf.score, daily_change_m: dailyChange,
      uncertainty_m_per_day: unc, min_current_m: minCur, max_current_m: maxCur, operational_status: opStatus,
    },
    decision_matrix: {
      data_reliability: reliability, reliability_score: relScore, level_decision: levelDecision,
      rainfall_decision: rainStatus, combined_decision: combined,
    },
    risk_assessment: { overall_status: combined, risk_level: risk, primary_risk: primary, recommended_action: action },
  };
}


// ─────────────────────────────────────────────────────────────────────
// 7-day projection. Same rules as the MIKE script: the level drifts by the
// daily change tied to this month's rainfall %, and the uncertainty is
// (uncertainty per day) × (days since the reading). Day n is computed as if
// the last reading were (age + n) days old, so a stale reading gives a wide
// band that keeps widening. It does NOT use the weather forecast.
// ─────────────────────────────────────────────────────────────────────
export interface ProjectionDay {
  dayOffset: number; // 0 = today
  date: string; // YYYY-MM-DD (Manila)
  levelM: number; // middle of the band
  minM: number;
  maxM: number;
  decision: LevelDecision | "UNCERTAIN"; // UNCERTAIN = band wider than 2 m, the middle says little
  couldBeEmergency: boolean; // lower edge of the band is under the emergency minimum
  couldOverflow: boolean; // upper edge of the band is over the overflow level
}

function levelDecisionFor(level: number): LevelDecision {
  return level < C.emergencyMinM ? "EMERGENCY" : level < C.optimalRechargeMinM ? "CAUTION" : level > C.overflowLevelM ? "OVERFLOW RISK" : "STABLE";
}

export function projectReservoir(a: ReservoirAnalysis, days = 7, now: Date = new Date()): ProjectionDay[] | null {
  if (a.reservoir_level_m == null || a.level_data_age_days == null) return null;
  const lvl = Math.max(a.reservoir_level_m, 0);
  const age = a.level_data_age_days;
  const dc = a.prediction_analysis.daily_change_m;
  const out: ProjectionDay[] = [];
  for (let n = 0; n <= days; n++) {
    const d = age + n;
    const unc = uncertaintyFor(d);
    const min = clamp(lvl + dc * d - unc * d);
    const max = clamp(lvl + dc * d + unc * d);
    const mid = (min + max) / 2;
    const date = new Date(now.getTime() + 8 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
    out.push({
      dayOffset: n,
      date,
      levelM: mid,
      minM: min,
      maxM: max,
      decision: max - min > 2 ? "UNCERTAIN" : levelDecisionFor(mid),
      couldBeEmergency: min < C.emergencyMinM,
      couldOverflow: max > C.overflowLevelM,
    });
  }
  return out;
}