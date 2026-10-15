import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeviceOnlineStatus, listDeviceDetailsByIds } from "@/lib/cctv/client";

/**
 * Checks the Storm Water Harvesting Facility CCTV device via the Easy4IP
 * OpenAPI and updates its row in `devices`. CCTV has no metric readings
 * (no sensor_readings rows) — just an online/offline status and metadata,
 * matching what the old code actually did with this device.
 *
 * CCTV_EXTERNAL_DEVICE_ID matches both the seeded devices row and the
 * device's real Imou serial number (8K01F97PAZ7B7B1) — confirmed, not
 * guessed, since it's the same ID used to register the camera.
 */

const CCTV_EXTERNAL_DEVICE_ID = "8K01F97PAZ7B7B1";

// Always run on request — never prerender this at build time or cache its response.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  const { data: deviceRow, error: lookupError } = await supabase
    .from("devices")
    .select("id")
    .eq("external_device_id", CCTV_EXTERNAL_DEVICE_ID)
    .maybeSingle();

  if (lookupError || !deviceRow) {
    return NextResponse.json(
      {
        syncedAt: new Date().toISOString(),
        error: `CCTV device row not found (external_device_id="${CCTV_EXTERNAL_DEVICE_ID}"): ${lookupError?.message ?? "no matching row"}`,
      },
      { status: 500 },
    );
  }

  let status;
  let details;
  try {
    status = await getDeviceOnlineStatus(CCTV_EXTERNAL_DEVICE_ID);
    details = await listDeviceDetailsByIds(CCTV_EXTERNAL_DEVICE_ID);
  } catch (err) {
    return NextResponse.json(
      { syncedAt: new Date().toISOString(), error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }

  // When online, "now" genuinely is the last update (we just confirmed it
  // live). When offline, use the device's own lastOffLineTime if Easy4IP
  // gave us a parseable one, so the dashboard shows when it actually went
  // dark rather than the time of this check.
  let lastUpdate = new Date().toISOString();
  if (!status.online && details.lastOffLineTime) {
    const offlineTime = new Date(details.lastOffLineTime);
    if (!Number.isNaN(offlineTime.getTime())) lastUpdate = offlineTime.toISOString();
  }

  const { error: updateError } = await supabase
    .from("devices")
    .update({
      status: status.online ? "online" : "offline",
      last_update: lastUpdate,
    })
    .eq("id", deviceRow.id);

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    results: [
      {
        label: "cctv/storm-water-facility",
        ok: !updateError,
        detail: updateError
          ? updateError.message
          : `${status.online ? "online" : "offline"}, ${status.channelCount} channel(s), model=${details.deviceModel ?? "unknown"}`,
      },
    ],
  });
}