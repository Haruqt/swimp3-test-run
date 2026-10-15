import { createClient } from "@/lib/supabase/server";
import { getReservoirStatus } from "@/lib/reservoirStatus";
import { ReservoirDecisionCard } from "@/components/hub/ReservoirDecisionCard";
import { RESERVOIR_CONFIG } from "@/lib/waterQualityDSS";
import { ReservoirProjection } from "@/components/hub/ReservoirProjection";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-white/5 py-2 text-sm">
      <span className="text-mist/60">{k}</span>
      <span className="font-mono text-mist">{v}</span>
    </div>
  );
}

export default async function ReservoirPage() {
  const supabase = createClient();
  const s = await getReservoirStatus(supabase);
  const b = s.builtIn;
  const fmt = (n: number | null, d = 2) => (n == null ? "—" : n.toFixed(d));

  return (
    <div className="px-8 py-6">
      <h1 className="font-display text-2xl font-semibold text-mist">Reservoir Prediction &amp; Decision</h1>
      <p className="mt-1 text-sm text-mist/50">
        MIKE Operations results when the old PC has reported in the last 48 hours; otherwise the site runs the same decision logic itself.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ReservoirDecisionCard status={s} />

        <div className="rounded-xl bg-white/5 p-6">
          <h3 className="font-display text-base font-semibold text-mist">MIKE link status</h3>
          {s.mike ? (
            <>
              <Row k="Last MIKE result" v={new Date(s.mike.analysis_timestamp).toLocaleString()} />
              <Row k="Received by site" v={new Date(s.mike.received_at).toLocaleString()} />
              <Row k="Fresh (&lt; 48 h)" v={s.mikeFresh ? "Yes" : "No — using site analysis"} />
              <Row k="MIKE said" v={`${s.mike.risk_level ?? "?"} · ${s.mike.overall_status ?? "?"}`} />
            </>
          ) : (
            <p className="mt-3 text-sm text-mist/60">
              No MIKE result has been received yet. Once the script on the old PC points at <code>/api/mike/ingest</code> its results will appear here (see MIKE_INTEGRATION.md).
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <ReservoirProjection days={s.projection} ageDays={b.level_data_age_days} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-6">
          <h3 className="font-display text-base font-semibold text-mist">Site analysis (live Supabase data)</h3>
          {b.data_issue && <p className="mt-2 text-xs text-amber-400">{b.data_issue}</p>}
          <Row k="Level" v={b.reservoir_level_m == null ? "—" : `${fmt(b.reservoir_level_m)} m of ${RESERVOIR_CONFIG.maxLevelM} m`} />
          <Row k="Reading time" v={b.level_data_timestamp ? new Date(b.level_data_timestamp).toLocaleString() : "—"} />
          <Row k="Reading age" v={b.level_data_age_days == null ? "—" : `${fmt(b.level_data_age_days, 1)} days`} />
          <Row k="Data reliability" v={b.decision_matrix.data_reliability} />
          <Row k="Level decision" v={b.decision_matrix.level_decision} />
          <Row k="Combined decision" v={b.decision_matrix.combined_decision} />
        </div>

        <div className="rounded-xl bg-white/5 p-6">
          <h3 className="font-display text-base font-semibold text-mist">Prediction (current level estimate)</h3>
          <Row k="Confidence" v={`${b.prediction_analysis.confidence} (${b.prediction_analysis.confidence_score})`} />
          <Row k="Expected daily change" v={`${b.prediction_analysis.daily_change_m >= 0 ? "+" : ""}${b.prediction_analysis.daily_change_m} m/day`} />
          <Row k="Likely level now" v={`${fmt(b.prediction_analysis.min_current_m)} – ${fmt(b.prediction_analysis.max_current_m)} m`} />
          <Row k="Operational status" v={b.prediction_analysis.operational_status} />
          <h3 className="mt-6 font-display text-base font-semibold text-mist">Rainfall vs normal</h3>
          <Row k="Status" v={b.rainfall_analysis.status} />
          <Row k="% of normal" v={b.rainfall_analysis.percent_of_normal == null ? "—" : `${b.rainfall_analysis.percent_of_normal.toFixed(0)}%`} />
          <p className="mt-2 text-xs text-mist/50">{b.rainfall_analysis.note}</p>
        </div>
      </div>
    </div>
  );
}