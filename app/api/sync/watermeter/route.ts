import { parseVendorTime } from "@/lib/parseLocalTime";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMeterData } from "@/lib/watermeter/client";

export const dynamic = "force-dynamic";

/**
 * Pulls live readings from the smart water meter platform
 * (47.103.146.199:6071) and writes them into this project's own Supabase
 * `devices`/`sensor_readings` tables.
 *
 * METER_ID_TO_EXTERNAL_DEVICE_ID below is an ASSUMED mapping, not a
 * confirmed one — the old code's device-name map ties each MeterId to a
 * "Smart Meter N" label, and this project's seed.ts separately names 4
 * devices "Smart Water Meter 1..4" with external_device_id SWM-001..004,
 * but nothing has confirmed those two numbering schemes actually line up
 * 1:1. Cross-check against the S/N-to-location list from the handoff
 * (SM 1 Dulo, SM 2 Tapat Senior Citizen, SM 3 Dulo/office TB, SM 4 Beside
 * Senior Citizen — S/N suffixes 74/72/73/75 respectively, which is where
 * the mapping below comes from) before trusting this in production.
 *
 * Units are also a guess: the vendor field names (PositiveInstantaneousFlow,
 * PositiveCumulativeFlow, PipelinePressure) don't state their units
 * anywhere in the recovered code. Using m³/h and m³ and bar as the most
 * common convention for this class of device — verify against a real
 * reading if possible (e.g. compare PositiveCumulativeFlow across two
 * syncs a known time apart against PositiveInstantaneousFlow).
 */

const METER_ID_TO_EXTERNAL_DEVICE_ID: Record<string, string> = {
  "62992212211174": "SWM-001", // SM 1 — Dulo (near public CR)
  "62992212211172": "SWM-002", // SM 2 — Tapat Senior Citizen
  "62992212211173": "SWM-003", // SM 3 — Dulo (near TB office)
  "62992212211175": "SWM-004", // SM 4 — Beside Senior Citizen
};

// This API has no explicit online/offline flag (unlike XYT's `status`),
// so device status is derived from how fresh CommunicationTime is —
// matching the 3-state `device_status` enum already in the schema
// (online | stale | offline) instead of hardcoding "online" regardless of
// whether the meter has actually reported recently. A meter with a
// missing/unparseable CommunicationTime is treated as offline rather than
// silently defaulting to "now", since we have no real evidence it's alive.
const ONLINE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // reported within last 2h
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // reported within last 24h

export async function GET() {
  const supabase = createAdminClient();
  const results: Array<{ label: string; ok: boolean; detail: string }> = [];

  const meterIds = Object.keys(METER_ID_TO_EXTERNAL_DEVICE_ID);

  let readings;
  try {
    readings = await getMeterData(meterIds);
  } catch (err) {
    // This API call covers ALL meters in one request, so a failure here
    // (e.g. connection refused to 47.103.146.199:6071) means every meter
    // is unreachable at once — mirrors the live site's real cURL error
    // display, just for the whole batch rather than per-meter, since
    // that's genuinely how this backend is called. Persist it to each
    // meter's `last_error` (and mark offline) instead of only returning
    // it in this response, so it shows up on the dashboard even if nobody
    // is watching this endpoint directly.
    const message = err instanceof Error ? err.message : "Unknown error";
    for (const externalId of Object.values(METER_ID_TO_EXTERNAL_DEVICE_ID)) {
      await supabase
        .from("devices")
        .update({ status: "offline", last_error: message })
        .eq("external_device_id", externalId);
    }
    return NextResponse.json(
      { syncedAt: new Date().toISOString(), error: message },
      { status: 502 },
    );
  }

  for (const reading of readings) {
    const externalId = METER_ID_TO_EXTERNAL_DEVICE_ID[reading.MeterId];
    if (!externalId) {
      results.push({ label: `watermeter/${reading.MeterId}`, ok: false, detail: "Unmapped MeterId — add it to METER_ID_TO_EXTERNAL_DEVICE_ID" });
      continue;
    }

    const { data: deviceRow, error: lookupError } = await supabase
      .from("devices")
      .select("id")
      .eq("external_device_id", externalId)
      .maybeSingle();

    if (lookupError || !deviceRow) {
      results.push({
        label: `watermeter/${externalId}`,
        ok: false,
        detail: `Device row not found (external_device_id="${externalId}"): ${lookupError?.message ?? "no matching row"}`,
      });
      continue;
    }

    // Real last-report time from the vendor, used both as recorded_at and
    // to derive online/stale/offline status below.
    const parsedComm = parseVendorTime(reading.CommunicationTime);
    const commTime = parsedComm ?? new Date(NaN);
    const commTimeValid = parsedComm !== null;
    const recordedAt = commTimeValid ? commTime.toISOString() : new Date().toISOString();

    const ageMs = commTimeValid ? Date.now() - commTime.getTime() : Infinity;
    const deviceStatus = ageMs <= ONLINE_MAX_AGE_MS ? "online" : ageMs <= STALE_MAX_AGE_MS ? "stale" : "offline";

    const metrics: Array<{ metric: string; value: unknown; unit: string }> = [
      { metric: "flow", value: reading.PositiveInstantaneousFlow, unit: "m³/h" },
      { metric: "flow_total", value: reading.PositiveCumulativeFlow, unit: "m³" },
      { metric: "pressure", value: reading.PipelinePressure, unit: "bar" },
      // Stored as its own history (not just overwritten on devices.battery_pct
      // each sync) so lib/waterMeterDSS.ts's battery-trend analysis — ported
      // from the real SM#AnalyzeMeterDecisionSupport.py scripts — has real
      // data to compare against over time, same idea as battery_ts there.
      { metric: "battery_voltage", value: reading.MeterVoltage, unit: "V" },
    ];

    let anyOk = false;
    const detailParts: string[] = [];

    for (const { metric, value, unit } of metrics) {
      const numeric = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
      if (Number.isNaN(numeric)) {
        detailParts.push(`${metric}: no numeric value`);
        continue;
      }

      // upsert + ignoreDuplicates, not insert: an offline/stale meter keeps
      // returning its last-known reading (same value, same
      // CommunicationTime) on every sync cycle. A plain insert() throws
      // "duplicate key value violates unique constraint
      // sensor_readings_device_metric_time_key" every time that happens —
      // which is exactly the wall of errors seen in the Supabase logs for
      // SWM-001/002/003/004. Upserting with ignoreDuplicates just silently
      // skips the no-op instead of erroring.
      const { error: insertError } = await supabase
        .from("sensor_readings")
        .upsert(
          { device_id: deviceRow.id, metric, value: numeric, unit, recorded_at: recordedAt },
          { onConflict: "device_id,metric,recorded_at", ignoreDuplicates: true },
        );

      if (insertError) {
        detailParts.push(`${metric}: ${insertError.message}`);
      } else {
        anyOk = true;
        detailParts.push(`${metric}: ${numeric} ${unit}`);
      }
    }

    // Clear any previously-stored connection error now that this meter
    // answered — last_error should only ever reflect the CURRENT state,
    // not linger after the problem is gone. battery_pct holds the raw
    // voltage here, same convention already used for pressure sensors
    // (see components/map/SensorDetailPanel.tsx's note on that).
    const voltageNumeric = Number(reading.MeterVoltage);
    await supabase
      .from("devices")
      .update({
        status: deviceStatus,
        last_update: recordedAt,
        last_error: null,
        ...(Number.isNaN(voltageNumeric) ? {} : { battery_pct: voltageNumeric }),
      })
      .eq("id", deviceRow.id);

    results.push({
      label: `watermeter/${externalId}`,
      ok: anyOk,
      detail: `${deviceStatus}, last reported ${commTimeValid ? reading.CommunicationTime : "unknown"} — ${detailParts.join(", ")}`,
    });
  }

  return NextResponse.json({ syncedAt: new Date().toISOString(), results });
}