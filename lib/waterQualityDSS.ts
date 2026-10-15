// Real Decision Support System logic for the groundwater Well and
// Reservoir, ported from the recovered IronPython script
// "groundwaterresevourdesicion support tool.txt" that ran inside DHI MIKE
// Operations on the old dev PC. This is the actual rule-based engine the
// project was built around — thresholds, human-readable explanations, and
// the recharge allow/hold/block logic are all taken directly from that
// script, not invented for this rebuild.
//
// What this does NOT include: the MIKE hydrological prediction/forecast
// module (reservoir level forecasting via DHI's modeling engine). That
// depends on the actual MIKE Operations software running on the physical
// dev PC — it's a real hydrological model, not something that can be
// re-implemented as a plain function. This file only covers the parts that
// are genuinely just decision rules over live sensor values, which run
// fine anywhere.

export type MetricStatus = "optimal" | "warning" | "critical" | "emergency" | "unknown";

export interface MetricConfig {
  optimal: [number, number];
  warning: [number, number];
  critical: [number, number];
  unit: string;
  actions: { low: string; high: string; optimal: string; [key: string]: string };
  rechargeDecision?: { allow: string; hold: string; block: string };
}

// Metric keys match what the sync routes already write (ph, temperature_ph,
// conductivity, tds, salinity, temperature_tds, level) for both the Well
// and Reservoir devices.
export const SENSOR_CONFIGS: Record<string, MetricConfig> = {
  ph: {
    optimal: [6.5, 8.5],
    warning: [6.0, 9.0],
    critical: [5.5, 9.5],
    unit: "pH",
    actions: {
      low: "ACIDIC WATER: Add pH balancing agents to increase alkalinity.",
      high: "ALKALINE WATER: Add pH balancing agents to reduce alkalinity.",
      optimal: "OPTIMAL pH: Perfect for water storage and aquatic life.",
    },
    rechargeDecision: {
      allow: "pH is suitable for groundwater recharge.",
      hold: "pH outside optimal range. Consider treatment before recharge.",
      block: "pH in critical range. DO NOT RECHARGE - risk of aquifer contamination.",
    },
  },
  temperature_ph: {
    optimal: [15, 25],
    warning: [10, 30],
    critical: [5, 35],
    unit: "°C",
    actions: {
      low: "LOW TEMPERATURE: Risk of slowed biological activity.",
      high: "HIGH TEMPERATURE: Increased bacterial growth risk.",
      optimal: "OPTIMAL TEMPERATURE: Ideal for water treatment processes.",
    },
  },
  temperature_tds: {
    optimal: [15, 25],
    warning: [10, 30],
    critical: [5, 35],
    unit: "°C",
    actions: {
      low: "LOW TEMPERATURE: Risk of slowed biological activity.",
      high: "HIGH TEMPERATURE: Increased bacterial growth risk.",
      optimal: "OPTIMAL TEMPERATURE: Ideal for water treatment processes.",
    },
  },
  conductivity: {
    optimal: [0.05, 1.5],
    warning: [0.02, 2.0],
    critical: [0.01, 3.0],
    unit: "mS/cm",
    actions: {
      low: "LOW MINERAL CONTENT: Very pure water - may need remineralization.",
      high: "HIGH MINERAL CONTENT: Possible contamination or saltwater intrusion.",
      optimal: "OPTIMAL CONDUCTIVITY: Balanced mineral content.",
    },
    rechargeDecision: {
      allow: "Conductivity within acceptable range for recharge.",
      hold: "Elevated conductivity - possible contamination.",
      block: "Critical conductivity level - DO NOT RECHARGE.",
    },
  },
  tds: {
    optimal: [50, 500],
    warning: [30, 800],
    critical: [10, 1200],
    unit: "mg/L",
    actions: {
      low: "VERY LOW TDS: May indicate distilled or highly purified water.",
      high: "HIGH TDS: Total Dissolved Solids elevated. May require treatment.",
      optimal: "OPTIMAL TDS: Good balance for most water uses.",
    },
    rechargeDecision: {
      allow: "TDS within safe limits for groundwater recharge.",
      hold: "TDS approaching upper limit - consider treatment.",
      block: "TDS exceeds safe limit - DO NOT RECHARGE.",
    },
  },
  salinity: {
    optimal: [0.5, 3.0],
    warning: [0.2, 5.0],
    critical: [0.1, 8.0],
    unit: "ppt",
    actions: {
      low: "LOW SALINITY: Freshwater conditions - ideal for most applications.",
      high: "HIGH SALINITY: Saltwater influence detected.",
      optimal: "OPTIMAL SALINITY: Suitable for mixed water applications.",
    },
    rechargeDecision: {
      allow: "Salinity within acceptable range.",
      hold: "Elevated salinity - risk of soil salinization.",
      block: "Critical salinity - DO NOT RECHARGE to protect aquifer.",
    },
  },
  level: {
    optimal: [2.0, 4.5], // calibrated for the 100 m³ reservoir
    warning: [1.0, 4.8],
    critical: [0.5, 5.0],
    unit: "m",
    actions: {
      low: "LOW WATER LEVEL: Consider water conservation measures.",
      high: "HIGH WATER LEVEL: Monitor for potential overflow.",
      optimal: "OPTIMAL LEVEL: Adequate water supply with safety margin.",
    },
  },

  // Turbidity and chlorine weren't in the recovered script's thresholds at
  // all (the physical Well/Reservoir sensors don't measure them) — these
  // use standard WHO/EPA drinking-water guideline ranges instead, added so
  // any device that does report them shows a real status instead of
  // "unknown", rather than being ported from a project-specific source.
  turbidity: {
    optimal: [0, 1],
    warning: [0, 5],
    critical: [0, 10],
    unit: "NTU",
    actions: {
      low: "LOW TURBIDITY: Excellent water clarity.",
      high: "HIGH TURBIDITY: Elevated suspended particles — review filtration.",
      optimal: "OPTIMAL TURBIDITY: Water is clear.",
    },
  },
  chlorine: {
    optimal: [0.2, 1.0],
    warning: [0.1, 2.0],
    critical: [0, 4.0],
    unit: "mg/L",
    actions: {
      low: "LOW CHLORINE: Insufficient disinfectant residual — risk of microbial regrowth.",
      high: "HIGH CHLORINE: Excess disinfectant — may affect taste/odor.",
      optimal: "OPTIMAL CHLORINE: Adequate disinfection residual.",
    },
  },
};

/** Evaluate a single metric's real-world status and explanation, per the recovered thresholds. */
export function evaluateMetric(metric: string, value: number): { status: MetricStatus; message: string; unit: string } {
  const config = SENSOR_CONFIGS[metric];
  if (!config) return { status: "unknown", message: "No threshold configuration for this metric.", unit: "" };

  const { optimal, warning, critical, unit, actions } = config;
  const isLow = value < optimal[0];

  if (value >= optimal[0] && value <= optimal[1]) {
    return { status: "optimal", message: actions.optimal, unit };
  }
  if (value >= warning[0] && value <= warning[1]) {
    return { status: "warning", message: isLow ? actions.low : actions.high, unit };
  }
  if (value >= critical[0] && value <= critical[1]) {
    return { status: "critical", message: isLow ? actions.low : actions.high, unit };
  }
  return { status: "emergency", message: isLow ? actions.low : actions.high, unit };
}

// Reservoir physical properties, from the recovered script's
// RESERVOIR_CONFIG (marked there as "CALIBRATE THIS!" — these are the
// project's own best estimates, not independently verified measurements).
export const RESERVOIR_CONFIG = {
  capacityM3: 100.0,
  maxLevelM: 5.0,
  overflowLevelM: 4.8,
  optimalRechargeMinM: 2.0,
  emergencyMinM: 0.5,
  levelToVolumeFactor: 20.0, // m³ per meter of level
  pumpFlowRateM3h: 24.0,
};

export type PumpStatus = "RUNNING" | "RECHARGING_OR_LEAKING" | "IDLE" | "UNKNOWN";

/** Infer pump activity from the two most recent level readings (rate of change), same thresholds as the original script. */
export function inferPumpStatus(
  previous: { value: number; recordedAt: string } | null,
  current: { value: number; recordedAt: string },
): { status: PumpStatus; rateMPerHour: number } {
  if (!previous) return { status: "UNKNOWN", rateMPerHour: 0 };

  const hours = (new Date(current.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 3_600_000;
  if (hours <= 0) return { status: "UNKNOWN", rateMPerHour: 0 };

  const rate = (current.value - previous.value) / hours;
  if (rate > 0.05) return { status: "RUNNING", rateMPerHour: rate };
  if (rate < -0.02) return { status: "RECHARGING_OR_LEAKING", rateMPerHour: rate };
  return { status: "IDLE", rateMPerHour: rate };
}

export type RechargeDecision = "DO NOT RECHARGE" | "WAIT" | "RECHARGE URGENTLY" | "RECHARGE NOW" | "INSUFFICIENT DATA";

export interface RechargeAnalysis {
  decision: RechargeDecision;
  reasons: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  recommendedAction: string;
}

/**
 * Full port of RechargeDecisionSystem.analyze_recharge_opportunity: checks
 * water quality first (safety), then volume, then overflow risk, then
 * whether the pump is currently running — same priority order as the
 * original script.
 */
export function analyzeRechargeOpportunity(
  latestByMetric: Partial<Record<string, number>>,
  currentLevel: number | null,
  pumpStatus: PumpStatus,
): RechargeAnalysis {
  if (currentLevel == null) {
    return {
      decision: "INSUFFICIENT DATA",
      reasons: ["No current level reading available."],
      confidence: "LOW",
      recommendedAction: "Wait for a fresh level-sensor reading before deciding.",
    };
  }

  // 1. Water quality check (safety first)
  const qualityMetrics = ["ph", "conductivity", "tds", "salinity"];
  let qualityOverall: "ALLOW" | "HOLD" | "BLOCK" = "ALLOW";
  const qualityReasons: string[] = [];
  for (const metric of qualityMetrics) {
    const value = latestByMetric[metric];
    if (value == null) continue;
    const { status } = evaluateMetric(metric, value);
    if (status === "emergency") {
      qualityOverall = "BLOCK";
      qualityReasons.push(`${metric}: CRITICAL — ${SENSOR_CONFIGS[metric].rechargeDecision?.block ?? "unsafe for recharge"}`);
    } else if (status === "critical") {
      if (qualityOverall !== "BLOCK") qualityOverall = "HOLD";
      qualityReasons.push(`${metric}: elevated — review before recharge`);
    } else if (status === "warning") {
      if (qualityOverall === "ALLOW") qualityOverall = "HOLD";
      qualityReasons.push(`${metric}: warning — monitor`);
    } else {
      qualityReasons.push(`${metric}: OK`);
    }
  }

  if (qualityOverall === "BLOCK") {
    return {
      decision: "DO NOT RECHARGE",
      reasons: qualityReasons,
      confidence: "HIGH",
      recommendedAction: "Wait for better quality water or treat before recharge.",
    };
  }

  // 2. Volume check
  if (currentLevel < RESERVOIR_CONFIG.optimalRechargeMinM) {
    return {
      decision: "WAIT",
      reasons: ["Insufficient volume for effective recharge."],
      confidence: "HIGH",
      recommendedAction: `Wait until level > ${RESERVOIR_CONFIG.optimalRechargeMinM}m.`,
    };
  }

  // 3. Overflow risk
  const distanceToOverflow = RESERVOIR_CONFIG.overflowLevelM - currentLevel;
  let overflowRisk: "LOW" | "HIGH" | "VERY HIGH" | "OVERFLOWING" = "LOW";
  const overflowDetails: string[] = [];
  if (distanceToOverflow <= 0) {
    overflowRisk = "OVERFLOWING";
    overflowDetails.push("Currently overflowing to canal.");
  } else if (distanceToOverflow < 0.2) {
    overflowRisk = "VERY HIGH";
    overflowDetails.push(`Only ${distanceToOverflow.toFixed(2)}m to overflow.`);
  } else if (distanceToOverflow < 0.5) {
    overflowRisk = "HIGH";
    overflowDetails.push(`${distanceToOverflow.toFixed(2)}m to overflow.`);
  }
  if (pumpStatus === "RUNNING") {
    const hoursToOverflow = distanceToOverflow / (RESERVOIR_CONFIG.pumpFlowRateM3h / RESERVOIR_CONFIG.levelToVolumeFactor);
    if (hoursToOverflow < 2) {
      overflowRisk = "VERY HIGH";
      overflowDetails.push(`Overflow in ${hoursToOverflow.toFixed(1)} hours if pump continues.`);
    } else if (hoursToOverflow < 8 && overflowRisk !== "VERY HIGH") {
      overflowRisk = "HIGH";
      overflowDetails.push(`Overflow in ${hoursToOverflow.toFixed(1)} hours if pump continues.`);
    }
  }

  if (overflowRisk === "HIGH" || overflowRisk === "VERY HIGH" || overflowRisk === "OVERFLOWING") {
    return {
      decision: "RECHARGE URGENTLY",
      reasons: ["High overflow risk.", ...overflowDetails],
      confidence: "HIGH",
      recommendedAction: "Start recharge immediately to prevent water loss to canal.",
    };
  }

  // 4. Pump currently running — avoid mixing during recharge
  if (pumpStatus === "RUNNING") {
    return {
      decision: "WAIT",
      reasons: ["Pump is currently adding new water."],
      confidence: "MEDIUM",
      recommendedAction: "Start recharge after pump stops for stable water quality.",
    };
  }

  // 5. Optimal conditions
  return {
    decision: "RECHARGE NOW",
    reasons: ["All conditions optimal.", ...qualityReasons],
    confidence: "HIGH",
    recommendedAction: "Open recharge valve. Monitor water level drop.",
  };
}