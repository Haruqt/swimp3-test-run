// Real leak/pressure-alert logic — ported directly from the recovered
// IronPython script `script/pressuresensor/PerformDSSAnalysis.py` that ran
// inside DHI MIKE Operations on the old dev PC. These exact thresholds and
// the 5-status color system are the project's actual original DSS rule,
// not an approximation — see MIKE_SCRIPTS_REFERENCE.md for the full source.
//
// Original config (from PerformDSSAnalysis.py):
//   P_MIN_WARNING = 20.0        // Low pressure warning (Yellow)
//   P_CRITICAL_LOW = 15.0       // Critical low pressure (Orange)
//   DELTA_P_MAX_WARNING = 5.0   // Sudden drop within 1hr = leak signature (Red)
//   TIME_WINDOW_HOURS = 1.0
//
// Original status codes -> what we map them to here:
//   0  NORMAL        (Green)   -> "normal"
//   -1 LOW_ALERT     (Yellow)  -> "low_pressure"
//   2  CRITICAL_LOW  (Orange)  -> "critical_low"
//   3  SUDDEN_DROP   (Red)     -> "sudden_drop"   <- the actual leak signature
//   4  NO_DATA       (Purple)  -> "no_data"
//
// 2026-09-23: this replaces the earlier baseline-average-% approximation
// that lived in this same file — that version was an honest guess made
// before the real PerformDSSAnalysis.py script text was recovered. Now
// that we have the real thresholds, there's no reason to keep guessing.
//
// 2026-09-23 (same day, second pass — real bug fix): the 15/20/5 thresholds
// above are explicitly "IN METERS OF HEAD (mH2O)" in the script's own
// comments, but our pressure sensors report raw BAR (the vendor field is
// literally `PipelinePressure`/`currentValue` in bar — see the dashboard's
// PressureGauge, unit="bar"). The sibling scripts Pressuresensor1.py /
// Pressuresensor2.py (same MIKE_SCRIPTS_REFERENCE.md) show the missing
// step: they convert bar -> mH2O with `current_value_meters = raw_value_bar
// * BAR_TO_METER` (BAR_TO_METER = 10.197) BEFORE ever comparing against
// P_MIN_WARNING/P_CRITICAL_LOW/DELTA_P_MAX_WARNING. The first version of
// this port skipped that conversion and compared raw bar directly against
// the meter thresholds — so a perfectly normal ~2.6 bar reading (≈26.5m,
// comfortably above the 20m warning line) was misread as "2.60m ≤ 15m ->
// CRITICAL LOW", a false alarm on every real reading. Fixed below by
// converting to mH2O first, exactly like the real script does.

export type PressureStatus = "normal" | "low_pressure" | "critical_low" | "sudden_drop" | "no_data" | "offline";

export interface PressureAssessment {
  status: PressureStatus;
  color: "green" | "yellow" | "orange" | "red" | "purple" | "gray";
  message: string;
  currentValue: number | null;
  previousValue: number | null;
  dropAmount: number | null;
}

const P_MIN_WARNING = 20.0;
const P_CRITICAL_LOW = 15.0;
const DELTA_P_MAX_WARNING = 5.0;
const TIME_WINDOW_HOURS = 1.0;
// 1 bar = 10.197 meters of water head — the exact constant from the real
// recovered Pressuresensor1.py/Pressuresensor2.py scripts. Our sensors
// report bar; the thresholds above are in meters, so this conversion has
// to happen before any comparison.
const BAR_TO_METER = 10.197;

/**
 * `history` should be all past readings for this device's pressure metric
 * IN BAR (as stored — the vendor's raw unit), newest first, matching how
 * sensor_readings is already queried elsewhere in the dashboard. Converted
 * to mH2O internally before applying the real thresholds. The most recent
 * reading is "current"; the function looks back through `history` for the
 * most recent prior reading within the 1-hour window to check for a sudden
 * drop, exactly as the original script does.
 */
export function assessPressure(
  isOnline: boolean,
  history: Array<{ value: number; recorded_at: string }>,
): PressureAssessment {
  if (!isOnline) {
    return { status: "offline", color: "gray", message: "Sensor offline — cannot assess.", currentValue: null, previousValue: null, dropAmount: null };
  }
  if (history.length === 0) {
    return { status: "no_data", color: "purple", message: "No pressure readings on record.", currentValue: null, previousValue: null, dropAmount: null };
  }

  const currentBar = history[0].value;
  const currentTime = new Date(history[0].recorded_at).getTime();

  // Blank/null/zero readings -> NO_DATA (Purple), matching the original
  // script's explicit "pressure == 0 is a sensor error, not a real 0 bar
  // reading" rule. Checked on the raw bar value before conversion (0 bar
  // converts to 0m either way, so this is equivalent either way).
  if (currentBar == null || Number.isNaN(currentBar) || currentBar === 0) {
    return { status: "no_data", color: "purple", message: "Sensor reporting no valid pressure value.", currentValue: currentBar, previousValue: null, dropAmount: null };
  }

  const current = currentBar * BAR_TO_METER;

  // Check 1: Critical Low (<= 15.0m = Orange) — checked before the warning
  // band, exactly as the original script orders it.
  if (current <= P_CRITICAL_LOW) {
    return {
      status: "critical_low",
      color: "orange",
      message: `Critical low pressure: ${current.toFixed(2)}mH2O (${currentBar.toFixed(2)} bar) ≤ ${P_CRITICAL_LOW}m.`,
      currentValue: current,
      previousValue: null,
      dropAmount: null,
    };
  }

  // Check 2: Low Pressure Warning (15.1-20.0m = Yellow)
  if (current <= P_MIN_WARNING) {
    return {
      status: "low_pressure",
      color: "yellow",
      message: `Low pressure warning: ${current.toFixed(2)}mH2O (${currentBar.toFixed(2)} bar) ≤ ${P_MIN_WARNING}m.`,
      currentValue: current,
      previousValue: null,
      dropAmount: null,
    };
  }

  // Check 3: Sudden drop >= 5m within the last 1 hour = Red — the actual
  // leak signature. Walk backward through history for the nearest prior
  // valid (non-zero) reading within TIME_WINDOW_HOURS, same as the
  // original script's loop. Both sides of the comparison are converted to
  // mH2O first, same as `current` above.
  for (let i = 1; i < history.length; i++) {
    const prev = history[i];
    if (prev.value == null || Number.isNaN(prev.value) || prev.value === 0) continue; // skip blank/error prior points, keep looking further back

    const prevTime = new Date(prev.recorded_at).getTime();
    const hoursDiff = (currentTime - prevTime) / (1000 * 60 * 60);
    if (hoursDiff < 0 || hoursDiff > TIME_WINDOW_HOURS) break; // out of window — original script only looks within 1hr

    const prevMeters = prev.value * BAR_TO_METER;
    const drop = prevMeters - current;
    if (drop >= DELTA_P_MAX_WARNING) {
      return {
        status: "sudden_drop",
        color: "red",
        message: `Sudden pressure drop: fell ${drop.toFixed(2)}m (from ${prevMeters.toFixed(2)}m to ${current.toFixed(2)}m) within ${hoursDiff.toFixed(1)}hr — possible leak.`,
        currentValue: current,
        previousValue: prevMeters,
        dropAmount: drop,
      };
    }
    break; // original script only compares against the single nearest valid prior point, not all of them
  }

  return {
    status: "normal",
    color: "green",
    message: `Normal: ${current.toFixed(2)}mH2O (${currentBar.toFixed(2)} bar).`,
    currentValue: current,
    previousValue: null,
    dropAmount: null,
  };
}

/**
 * Rolls up per-sensor assessPressure() results into the dashboard's overall
 * "Leak Detection Status" panel — worst status across all pressure sensors
 * wins, since one sensor showing a sudden drop matters more than the rest
 * being fine.
 */
export function overallLeakStatus(assessments: PressureAssessment[]): {
  status: PressureStatus;
  message: string;
  countByStatus: Record<PressureStatus, number>;
} {
  const countByStatus: Record<PressureStatus, number> = {
    normal: 0,
    low_pressure: 0,
    critical_low: 0,
    sudden_drop: 0,
    no_data: 0,
    offline: 0,
  };
  for (const a of assessments) countByStatus[a.status]++;

  if (countByStatus.sudden_drop > 0) {
    return {
      status: "sudden_drop",
      message: `${countByStatus.sudden_drop} sensor(s) show a sudden pressure drop consistent with a leak — investigate immediately.`,
      countByStatus,
    };
  }
  if (countByStatus.critical_low > 0) {
    return {
      status: "critical_low",
      message: `${countByStatus.critical_low} sensor(s) at critically low pressure (≤${P_CRITICAL_LOW}m).`,
      countByStatus,
    };
  }
  if (countByStatus.low_pressure > 0) {
    return {
      status: "low_pressure",
      message: `${countByStatus.low_pressure} sensor(s) below the ${P_MIN_WARNING}m warning threshold.`,
      countByStatus,
    };
  }
  const analyzable = countByStatus.normal + countByStatus.low_pressure + countByStatus.critical_low + countByStatus.sudden_drop;
  if (analyzable === 0) {
    return { status: "no_data", message: "No pressure sensors currently reporting usable data.", countByStatus };
  }
  return { status: "normal", message: "All reporting pressure sensors within normal range — no leak signature detected.", countByStatus };
}