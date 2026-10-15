// Real client for the Groundwater Reservoir — a SEPARATE physical device
// from the Groundwater Well, discovered from recovered DSS scripts on the
// old dev PC (not previously known; earlier assumed to be mock data).
//
// Confirmed real values from the recovered IronPython DSS script:
//   deviceId: 254722, deviceNo: 0LSNY7E7J18N590C
//   OAuth client_id: set in env as DTUIP_RESERVOIR_CLIENT_ID (same Tlinkappid as
//     the Well — same account family, different physical device)
//   OAuth client_secret: set in env as DTUIP_RESERVOIR_CLIENT_SECRET
//   account username/password: set in env as HOLYKELL_USERNAME / HOLYKELL_PASSWORD
//
// 2026-09-22: the actual OAuth plumbing (login, token refresh, the
// getSingleDeviceDatas call) moved to lib/dtuip-oauth/client.ts, shared
// with the Well now that it turned out to be the same account — this file
// is now just that device's ID/serial plus its own exported function name,
// kept so the existing dtuip-reservoir sync route didn't need to change.
import { getDeviceDatas, type DtuipOAuthSensor } from "@/lib/dtuip-oauth/client";

const DEVICE_ID = "254722";
const DEVICE_NO = "0LSNY7E7J18N590C";

export type ReservoirSensor = DtuipOAuthSensor;

/** Fetch the Reservoir's current sensor readings. */
export async function getReservoirSensors(): Promise<{ sensors: ReservoirSensor[]; globalTime: string }> {
  return getDeviceDatas(DEVICE_ID, DEVICE_NO);
}