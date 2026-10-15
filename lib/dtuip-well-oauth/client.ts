// The Well, via the SAME app.dtuip.com OAuth backend used for the
// Reservoir (see lib/dtuip-oauth/client.ts) — added 2026-09-22 as an
// alternative to lib/dtuip/client.ts's manually-bootstrapped bearer token,
// which keeps needing to be re-captured from DevTools by hand.
//
// WELL_DEVICE_ID / WELL_DEVICE_NO below are confirmed from the Holykell
// dashboard itself (Device management → Cauayan City, Isabela → "Device
// ID:254718 | Serial number:M8091G4NJ67LK54N"), not guessed — but whether
// this OLD backend actually exposes this specific device the same way it
// exposes the Reservoir has NOT been confirmed yet (no network access to
// dtuip.com from where this was written). app/api/sync/dtuip-well/route.ts
// tries this first and falls back to lib/dtuip/client.ts automatically if
// it fails, so there's a working path either way.
import { getDeviceDatas } from "@/lib/dtuip-oauth/client";

const WELL_DEVICE_ID = "254718";
const WELL_DEVICE_NO = "M8091G4NJ67LK54N";

export async function getWellSensorsViaOAuth() {
  return getDeviceDatas(WELL_DEVICE_ID, WELL_DEVICE_NO);
}