// Real client for the CCTV platform — this is NOT the Imou consumer app
// (open.imoulife.com) despite the device being registered there; the
// device is actually reachable through Dahua's underlying Easy4IP OpenAPI
// (openapi.easy4ip.com), which the old dev PC's working Laravel app
// (cctvliveController.php) used successfully in production. Recovered
// from that code, not guessed.
//
// Auth is a signed-request scheme, no captcha, no browser session:
//   1. POST /openapi/accessToken with a system block containing an appId
//      and an md5 signature of "time:{t},nonce:{n},appSecret:{secret}" ->
//      returns { accessToken, expireTime, currentDomain }.
//   2. Every subsequent call includes that accessToken as a `token` param
//      plus its own freshly-signed `system` block.
// The token is time-limited (expireTime is a unix timestamp), so this
// caches it in the same app_settings table as the dtuip token and only
// requests a new one once the cached one is within 60s of expiring.
//
// Credentials (from the old dev PC's .env, still valid
// unless the account's app has since been recreated):
//   EASY4IP_APP_ID=<your Easy4IP app id>
//   EASY4IP_APP_SECRET=<your Easy4IP app secret>
// Put these in .env.local under those exact names.
//
// Confirmed real device ID (matches the Imou SN from the handoff):
//   8K01F97PAZ7B7B1

import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

// Confirmed working region via a real test call: Singapore. If the
// account's devices ever move region, Easy4IP's docs also list
// openapi-fk.easy4ip.com (Europe) and openapi-or.easy4ip.com (US).
const BASE_URL = "https://openapi-sg.easy4ip.com";
const TOKEN_ROW_KEY = "easy4ip_access_token";

interface StoredToken {
  accessToken: string;
  expireTime: number; // unix seconds
}

function sign(time: number, nonce: string, appSecret: string): string {
  return crypto.createHash("md5").update(`time:${time},nonce:${nonce},appSecret:${appSecret}`).digest("hex");
}

async function getStoredToken(): Promise<StoredToken | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", TOKEN_ROW_KEY).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as StoredToken;
  } catch {
    return null;
  }
}

async function setStoredToken(token: StoredToken): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("app_settings")
    .upsert({ key: TOKEN_ROW_KEY, value: JSON.stringify(token), updated_at: new Date().toISOString() });
}

async function requestNewToken(): Promise<StoredToken> {
  const appId = process.env.EASY4IP_APP_ID;
  const appSecret = process.env.EASY4IP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("EASY4IP_APP_ID / EASY4IP_APP_SECRET are not set in .env.local");
  }

  const time = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const res = await fetch(`${BASE_URL}/openapi/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: { ver: "1.0", sign: sign(time, nonce, appSecret), appId, time, nonce },
      params: {},
      id: crypto.randomUUID(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Easy4IP accessToken failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json?.result?.code && json.result.code !== "0") {
    throw new Error(`Easy4IP accessToken failed: ${json.result.msg ?? json.result.code}`);
  }
  const accessToken = json?.result?.data?.accessToken;
  const expireTime = json?.result?.data?.expireTime;
  if (!accessToken || !expireTime) {
    throw new Error(`Easy4IP accessToken: unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
  }

  const token: StoredToken = { accessToken, expireTime };
  await setStoredToken(token);
  return token;
}

async function getValidToken(): Promise<string> {
  const stored = await getStoredToken();
  const now = Math.floor(Date.now() / 1000);
  if (stored && stored.expireTime - 60 > now) {
    return stored.accessToken;
  }
  const fresh = await requestNewToken();
  return fresh.accessToken;
}

/**
 * POST to an Easy4IP openapi endpoint with a signed system block and the
 * given params (token is attached automatically).
 */
async function easy4ipPost(pathname: string, params: Record<string, unknown>): Promise<any> {
  const appId = process.env.EASY4IP_APP_ID;
  const appSecret = process.env.EASY4IP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("EASY4IP_APP_ID / EASY4IP_APP_SECRET are not set in .env.local");
  }
  const token = await getValidToken();

  const time = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: { ver: "1.0", appId, sign: sign(time, nonce, appSecret), time, nonce },
      id: crypto.randomUUID(),
      params: { token, ...params },
    }),
  });

  if (!res.ok) {
    throw new Error(`Easy4IP ${pathname} failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json?.result?.code && json.result.code !== "0") {
    throw new Error(`Easy4IP ${pathname} failed: ${json.result.msg ?? json.result.code}`);
  }
  return json;
}

export interface CctvDeviceStatus {
  online: boolean;
  channelCount: number;
  raw: unknown;
}

/** Check whether a device is online and how many channels it reports. */
export async function getDeviceOnlineStatus(deviceId: string): Promise<CctvDeviceStatus> {
  const json = await easy4ipPost("/openapi/deviceOnline", { deviceId });
  const channels = json?.result?.data?.channels;
  if (!Array.isArray(channels)) {
    throw new Error(`Easy4IP deviceOnline: unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
  }
  // Confirmed via the old code: presence in this response with populated
  // channels is treated as "online" — there's no separate boolean flag
  // observed in the recovered code, so treat a non-empty channel list as
  // the online signal and revisit if the real payload includes a status
  // field once this has actually been run.
  return { online: channels.length > 0, channelCount: channels.length, raw: json.result?.data };
}

export interface CctvDeviceDetails {
  deviceId: string;
  catalog: string;
  deviceStatus: string;
  source: string;
  wifiTransferMode: string;
  accessType: string;
  brand: string;
  sdcardStatus: string;
  lastOffLineTime: string;
  deviceModel: string;
  [key: string]: unknown;
}

/** Fetch device metadata/status details by ID — confirmed shape from the old code. */
export async function listDeviceDetailsByIds(deviceId: string): Promise<CctvDeviceDetails> {
  const json = await easy4ipPost("/openapi/listDeviceDetailsByIds", {
    deviceList: [{ deviceId, channelId: [0] }],
  });
  const device = json?.result?.data?.deviceList?.[0];
  if (!device) {
    throw new Error(`Easy4IP listDeviceDetailsByIds: no device in response: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return device as CctvDeviceDetails;
}

export interface LiveStreamUrls {
  hls?: string;
  flv?: string;
  rtmp?: string;
  [key: string]: unknown;
}

/**
 * Fetch the live stream URLs for the account's cameras, from the old
 * code's confirmed working call: POST /openapi/liveList with a
 * queryRange, pulling `result.data.lives[0].streams`.
 *
 * IMPORTANT: the old PHP just returned `$streams` raw without inspecting
 * its exact keys, so the real field names inside `streams` (hls/flv/rtmp
 * or something else) were never actually confirmed in the recovered code.
 * This throws with the raw JSON on an unexpected shape rather than
 * guessing — check that error message against a real response once this
 * runs, and adjust STREAM_KEY_CANDIDATES below if needed.
 */
const STREAM_KEY_CANDIDATES = ["hls", "HLS", "m3u8", "flv", "FLV"];

export async function getLiveStreamUrl(): Promise<{ url: string; protocol: string }> {
  const json = await easy4ipPost("/openapi/liveList", { queryRange: "1-10" });
  const streams = json?.result?.data?.lives?.[0]?.streams;
  if (!streams) {
    throw new Error(`Easy4IP liveList: no streams in response: ${JSON.stringify(json).slice(0, 500)}`);
  }

  // CONFIRMED real shape (2026-09): `streams` is an ARRAY of stream-quality
  // objects, each with its own "hls" field — e.g.
  //   [{ hls: "https://...m3u8?...", coverUrl, streamId: 0 }, { ...streamId: 1 }]
  // not a flat { hls: "..." } object as originally guessed. Take the first
  // entry's hls URL.
  if (Array.isArray(streams)) {
    const first = streams.find((s) => typeof s?.hls === "string" && s.hls.length > 0);
    if (first) return { url: first.hls, protocol: "hls" };
    throw new Error(`Easy4IP liveList: no entry with a usable hls URL in: ${JSON.stringify(streams).slice(0, 500)}`);
  }

  // Fallback for the originally-guessed flat-object shape, in case a
  // different account/device ever returns it that way.
  for (const key of STREAM_KEY_CANDIDATES) {
    const value = (streams as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) {
      return { url: value, protocol: key };
    }
  }

  const firstStringEntry = Object.entries(streams).find(([, v]) => typeof v === "string" && (v as string).length > 0);
  if (firstStringEntry) {
    return { url: firstStringEntry[1] as string, protocol: `unconfirmed:${firstStringEntry[0]}` };
  }

  throw new Error(`Easy4IP liveList: no usable stream URL found in: ${JSON.stringify(streams).slice(0, 500)}`);
}