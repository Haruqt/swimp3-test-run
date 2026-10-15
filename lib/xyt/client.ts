// Real client for the XYT pressure-sensor platform at
// http://111.19.141.81:8089/a — dashboard login (39175760007/60007) is
// never used here. Recovered from the old dev PC's working Laravel app
// (pressuresensorControlleradmin.php), which called this successfully in
// production — not guessed, not captured via DevTools.
//
// Unlike dtuip.com, this platform has NO captcha and NO session/login at
// all for its data API — every request is just a plain HTTP GET with an
// `appkey`/`secret` query-string pair, presumably scoped to this account
// by the vendor on their end. There is nothing to refresh and nothing to
// bootstrap; the appkey/secret pair simply IS the credential, same shape
// as an API key. Keep them in env vars anyway since they're effectively
// a password.
//
// Confirmed real endpoints (from the working PHP):
//   GET /a/api/appdevice?appkey=...&secret=...                       -> { data: [deviceId, ...] }
//   GET /a/api/device?appkey=...&secret=...&deviceid=X               -> { data: {...}, status: "online"|"offline" }
//   GET /a/api/devhistory?appkey=...&secret=...&deviceid=X&start=&end=&size=&no=1  -> { data: [{ value, time }, ...] }
//
// The exact shape of a single device's `data` object was never captured
// in the old code (it was merged/passed through as-is) — only that it's
// online/offline plus whatever raw fields the vendor sends. Treat
// `getPressureDevice`'s return type as provisional until we've seen one
// real response; log the raw JSON on first run and refine the field
// names in the sync route rather than guessing here.

const BASE_URL = "http://111.19.141.81:8089/a";

function authParams(extra: Record<string, string> = {}): URLSearchParams {
  const appkey = process.env.XYT_APPKEY;
  const secret = process.env.XYT_SECRET;
  if (!appkey || !secret) {
    throw new Error("XYT_APPKEY / XYT_SECRET are not set in .env.local");
  }
  return new URLSearchParams({ appkey, secret, ...extra });
}

export interface XytDeviceListResponse {
  data?: string[];
  [key: string]: unknown;
}

/** List every device ID visible to this account. */
export async function listPressureDeviceIds(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/appdevice?${authParams().toString()}`);
  if (!res.ok) {
    throw new Error(`XYT appdevice failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as XytDeviceListResponse;
  if (!Array.isArray(json.data)) {
    throw new Error(`XYT appdevice: unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json.data;
}

// Confirmed real single-device shape, from a live response on 2026-09-09
// (this was previously unconfirmed/guessed — see the sync route's history
// for the earlier wrong guess). The device's own online/offline flag and
// its numeric reading both live INSIDE `data`, not at the top level:
//   { id, deviceType, imei, imsi, iccid, longitudes, latitudes,
//     status: "在线" | "离线",   // online | offline, in Chinese
//     currentValue: number,      // the actual pressure reading
//     receiveTime: "YYYY-MM-DD HH:mm:ss",  // real last-upload timestamp
//     power, preL, preH, preUnits ("Bar"), preDot, hardwareVersion,
//     softwareVersion, uploadInterval, samplingInterval, shielding, rssi,
//     downloaded }
export interface XytDeviceData {
  id: string;
  status: "在线" | "离线" | string;
  currentValue: number;
  receiveTime: string;
  preUnits?: string;
  power?: number;
  rssi?: number;
  [key: string]: unknown;
}

export interface XytDeviceResponse {
  data?: XytDeviceData;
  [key: string]: unknown;
}

/** Fetch the current reading/status for a single device by its numeric device ID. */
export async function getPressureDevice(deviceId: string): Promise<XytDeviceResponse> {
  const res = await fetch(`${BASE_URL}/api/device?${authParams({ deviceid: deviceId }).toString()}`);
  if (!res.ok) {
    throw new Error(`XYT device (${deviceId}) failed: HTTP ${res.status}`);
  }
  return (await res.json()) as XytDeviceResponse;
}

export interface XytHistoryPoint {
  value: string | number;
  time: string;
  [key: string]: unknown;
}

export interface XytHistoryResponse {
  data?: XytHistoryPoint[];
  [key: string]: unknown;
}

/** Fetch historical readings for a device within a date range (old code used Y-m-d H:i:s strings). */
export async function getPressureDeviceHistory(
  deviceId: string,
  startDate: string,
  endDate: string,
  size = 300,
): Promise<XytHistoryPoint[]> {
  const res = await fetch(
    `${BASE_URL}/api/devhistory?${authParams({
      deviceid: deviceId,
      start: startDate,
      end: endDate,
      size: String(size),
      no: "1",
    }).toString()}`,
  );
  if (!res.ok) {
    throw new Error(`XYT devhistory (${deviceId}) failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as XytHistoryResponse;
  return Array.isArray(json.data) ? json.data : [];
}