import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mikeDecrypt } from "@/lib/mikeCrypto";
import { parseVendorTime } from "@/lib/parseLocalTime";

export const dynamic = "force-dynamic";

/**
 * Receives the reservoir analysis the MIKE Operations script computes on the
 * old PC. The script POSTs { "data": "<base64>" } where the base64 is the
 * AES-256-CBC-encrypted JSON (see lib/mikeCrypto.ts). Being able to decrypt
 * with MIKE_BRIDGE_PASSWORD is the authentication — there is no other secret.
 *
 * Stored in `mike_results`; the /reservoir page and dashboard prefer the
 * newest row when it is fresh and fall back to the site's own analysis.
 */
export async function POST(request: Request) {
  const password = process.env.MIKE_BRIDGE_PASSWORD;
  if (!password) return NextResponse.json({ error: "MIKE_BRIDGE_PASSWORD is not configured" }, { status: 500 });

  let body: { data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (typeof body.data !== "string" || body.data.length === 0 || body.data.length > 200_000) {
    return NextResponse.json({ error: "Missing or oversized `data`" }, { status: 400 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(mikeDecrypt(body.data, password));
  } catch {
    // Same answer for wrong password / corrupt data — don't help a guesser.
    return NextResponse.json({ error: "Could not decrypt payload" }, { status: 401 });
  }

  const risk = payload.risk_assessment ?? {};
  const level = Number(payload.reservoir_level_m);
  const age = Number(payload.level_data_age_days);
  const row = {
    analysis_id: payload.analysis_id != null ? String(payload.analysis_id) : null,
    analysis_timestamp: (parseVendorTime(payload.analysis_timestamp) ?? new Date()).toISOString(),
    reservoir_level_m: Number.isFinite(level) ? level : null,
    level_data_age_days: Number.isFinite(age) ? age : null,
    overall_status: risk.overall_status != null ? String(risk.overall_status) : null,
    risk_level: risk.risk_level != null ? String(risk.risk_level) : null,
    recommended_action: risk.recommended_action != null ? String(risk.recommended_action) : null,
    payload,
  };

  const supabase = createAdminClient();
  const { error } = row.analysis_id
    ? await supabase.from("mike_results").upsert(row, { onConflict: "analysis_id", ignoreDuplicates: true })
    : await supabase.from("mike_results").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, receivedAt: new Date().toISOString() });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "mike-ingest", method: "POST { data: <base64 AES-256-CBC> }" });
}