import type { SupabaseClient } from "@supabase/supabase-js";
import type { SensorReading } from "@/lib/types";
import { getRainfallVsNormal, type RainfallVsNormal } from "@/lib/rainfall";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeReservoir, projectReservoir, type ProjectionDay, type ReservoirAnalysis } from "@/lib/reservoirDSS";

const MIKE_FRESH_HOURS = 48;

export interface MikeResultRow {
  id: string;
  received_at: string;
  analysis_timestamp: string;
  payload: any;
  overall_status: string | null;
  risk_level: string | null;
  recommended_action: string | null;
  reservoir_level_m: number | null;
  level_data_age_days: number | null;
}

export interface ReservoirStatus {
  builtIn: ReservoirAnalysis;
  mike: MikeResultRow | null;
  mikeFresh: boolean;
  /** What to headline: fresh MIKE result if there is one, else the site's own analysis. */
  headline: { source: "MIKE" | "Site"; status: string; riskLevel: string; primaryRisk: string; action: string; levelM: number | null; ageDays: number | null };
  rainfall: RainfallVsNormal | null;
  levelHistory: { t: string; v: number }[];
  projection: ProjectionDay[] | null;
}

export async function getReservoirStatus(supabase: SupabaseClient<any, any, any>): Promise<ReservoirStatus> {
  const { data: dev } = await supabase.from("devices").select("id").eq("group_type", "groundwater_reservoir").limit(1).maybeSingle();
  // Newest valid level readings, no time window: a dead sensor must still show its last real value (and how old it is).
  // Values at or below -10 are sensor error codes (e.g. -20) and are skipped.
  const { data: levelRows } = dev
    ? await supabase
        .from("sensor_readings")
        .select("*")
        .eq("device_id", dev.id)
        .eq("metric", "level")
        .gt("value", -10)
        .order("recorded_at", { ascending: false })
        .limit(300)
    : { data: [] as SensorReading[] };
  const valid = ((levelRows as SensorReading[] | null) ?? []);
  const latest = valid[0] ?? null;

  const rainfall = await getRainfallVsNormal().catch(() => null);
  const note = rainfall
    ? `${rainfall.actualMm.toFixed(0)} mm in the first ${rainfall.daysCompared} day(s) of ${rainfall.month} vs ${rainfall.normalMm.toFixed(0)} mm normal for the same days (2000–2024 avg)${rainfall.lowConfidence ? " — few days elapsed, noisy" : ""}`
    : "Rainfall comparison unavailable";

  const builtIn = analyzeReservoir({
    levelM: latest ? Number(latest.value) : null,
    levelTimestamp: latest?.recorded_at ?? null,
    rainfallPct: rainfall?.percentOfNormal ?? null,
    rainfallNote: note,
  });

  // mike_results is private (no public read policy): read it server-side with the service-role key.
  let mike: MikeResultRow | null = null;
  try {
    const { data: mikeRow } = await createAdminClient()
      .from("mike_results")
      .select("*")
      .order("analysis_timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();
    mike = (mikeRow as MikeResultRow | null) ?? null;
  } catch (err) {
    console.error("mike_results read failed:", err instanceof Error ? err.message : err);
  }
  const mikeFresh = !!mike && Date.now() - new Date(mike.analysis_timestamp).getTime() < MIKE_FRESH_HOURS * 3_600_000;

  const headline =
    mike && mikeFresh
      ? {
          source: "MIKE" as const,
          status: mike.overall_status ?? "UNKNOWN",
          riskLevel: mike.risk_level ?? "UNKNOWN",
          primaryRisk: String(mike.payload?.risk_assessment?.primary_risk ?? ""),
          action: mike.recommended_action ?? "",
          levelM: mike.reservoir_level_m,
          ageDays: mike.level_data_age_days,
        }
      : {
          source: "Site" as const,
          status: builtIn.risk_assessment.overall_status,
          riskLevel: builtIn.risk_assessment.risk_level,
          primaryRisk: builtIn.risk_assessment.primary_risk,
          action: builtIn.risk_assessment.recommended_action,
          levelM: builtIn.reservoir_level_m,
          ageDays: builtIn.level_data_age_days,
        };

  const levelHistory = valid.slice(0, 300).reverse().map((r) => ({ t: r.recorded_at, v: Number(r.value) }));
  return { builtIn, mike, mikeFresh, headline, rainfall, levelHistory, projection: projectReservoir(builtIn) };
}