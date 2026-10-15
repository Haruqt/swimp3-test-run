// Real client for the IoT dashboard behind holykell-iot.com — captured via
// browser DevTools, NOT the h-smartlink.com API from Holykell's public docs
// (that's a different backend entirely; see lib/holykell/ — kept only as
// reference, not currently wired into any sync route).
//
// Login itself (POST /api-user/login/accountLogin) can't be automated: the
// username/password fields are client-side encrypted before being sent, and
// a slider-puzzle CAPTCHA gates the submit button. Both exist specifically
// to block this kind of automation.
//
// Instead, this uses a captured bearer token from an already-logged-in
// browser session, and rides the platform's own sliding-refresh scheme:
// every authenticated request accepts a `Refresh_token: Y` header, and the
// server responds with a fresh token in a `setToken` response header when
// the current one is close to expiring. As long as something calls this
// periodically (e.g. a scheduled sync route) and always saves whatever
// `setToken` comes back, the token renews itself indefinitely — no need to
// repeat the manual capture, unless the session gets fully revoked
// server-side (a password change, a long period of total inactivity, etc).
//
// One-time setup: capture a bearer token from DevTools (Network tab → any
// authenticated request → Headers → Request Headers → Authorization) and
// put it in .env.local as DTUIP_BOOTSTRAP_TOKEN. The very first call will
// seed it into the app_settings table; after that, app_settings is the
// source of truth and the env var is never read again.
//
// Confirmed real endpoint (via captured request): GET
// /api-device/device/sensorList?userId=...&groupId=&deviceId=...&pageNum=1&pageSize=20

import { createAdminClient } from "@/lib/supabase/admin";

const BASE_URL = "https://front.dtuip.com";
const TOKEN_KEY = "dtuip_access_token";

// This is the account's Tlinkappid — same value as the clientId shown on
// the Holykell dashboard's Account Settings page. Confirmed via a captured
// real request, not guessed.
const TLINK_APP_ID = process.env.DTUIP_RESERVOIR_CLIENT_ID ?? "";

// Confirmed via a captured real request's X-User-Header (URL-decoded).
const X_USER_HEADER = process.env.HOLYKELL_USERNAME ?? "";

// Confirmed via captured requests — sent as X-Userid-Header alongside
// X-User-Header on every authenticated call. Same value as this account's
// userId query param and Account ID on the dashboard.
const X_USERID_HEADER = "93443";
async function getStoredToken(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", TOKEN_KEY).maybeSingle();

  if (data?.value) return data.value;

  const bootstrap = process.env.DTUIP_BOOTSTRAP_TOKEN;
  if (!bootstrap) {
    throw new Error(
      "No dtuip token in app_settings and DTUIP_BOOTSTRAP_TOKEN is not set — capture one from DevTools first.",
    );
  }
  await setStoredToken(bootstrap);
  return bootstrap;
}

async function setStoredToken(token: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("app_settings").upsert({ key: TOKEN_KEY, value: token, updated_at: new Date().toISOString() });
}

/**
 * Fetch a dtuip.com endpoint with auth headers attached, and transparently
 * persist a renewed token if the server hands one back via `setToken`.
 * Pass a path starting with "/api/...".
 */
export async function dtuipFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getStoredToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${token}`,
      Refresh_token: "Y",
      Tlinkappid: TLINK_APP_ID,
      "X-User-Header": X_USER_HEADER,
      "X-Userid-Header": X_USERID_HEADER,
      "Interface-Type": "form",
      Language: "en",
      ...(init.headers ?? {}),
    },
  });

  const freshToken = res.headers.get("setToken") ?? res.headers.get("settoken");
  if (freshToken && freshToken !== token) {
    await setStoredToken(freshToken);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `dtuip.com returned ${res.status} — the stored token is likely fully expired/revoked and needs a fresh manual capture (update DTUIP_BOOTSTRAP_TOKEN and clear the app_settings row).`,
    );
  }

  return res;
}

export interface DtuipSensor {
  sensorId: string;
  sensorName: string; // e.g. "PH", "Temperature of PH", "level sensor"
  sensorType: string;
  value: string | null; // current value, as a string
  unit: string;
  updateDateTime: string | null; // "YYYY/MM/DD HH:mm:ss", not ISO
  isAlarm: string; // "0" | "1"
  isLine: string; // "0" | "1" — per-sensor online status
}

/**
 * Get sensors for one device on this account, by its dashboard Device ID
 * (the numeric ID shown in the sidebar, e.g. 254718 for the Groundwater
 * Well) — confirmed via a captured real request's query params.
 *
 * Real confirmed response shape (via an actual error dump, not a guess):
 *   { datas: { records: [ { deviceId, deviceNo, ..., sensorList: [...] } ] } }
 * `records` is one entry per matching device (we filter by deviceId, so
 * normally just one), and the actual per-sensor readings live in that
 * record's `sensorList` array.
 */
export async function getSensorsByDeviceId(userId: string, deviceId: string | number): Promise<DtuipSensor[]> {
  const params = new URLSearchParams({
    userId,
    groupId: "",
    deviceId: String(deviceId),
    pageNum: "1",
    pageSize: "20",
  });
  const res = await dtuipFetch(`/api-device/device/sensorList?${params.toString()}`);
  const json = await res.json();

  const ok = json.resp_code === 0 || json.code === 0;
  if (!ok) {
    throw new Error(`dtuip sensorList failed: ${json.resp_msg || json.msg || json.resp_code || json.code}`);
  }

  const records = json.datas?.records;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`dtuip sensorList: no matching device record for deviceId=${deviceId}. Raw body: ${JSON.stringify(json).slice(0, 1000)}`);
  }

  const sensorList = records[0]?.sensorList;
  if (!Array.isArray(sensorList)) {
    throw new Error(`dtuip sensorList: device record has no sensorList array. Raw body: ${JSON.stringify(records[0]).slice(0, 1000)}`);
  }

  return sensorList as DtuipSensor[];
}