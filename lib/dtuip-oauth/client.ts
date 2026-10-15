// Shared OAuth client for app.dtuip.com — the OLD, simple backend behind
// this Holykell account. Originally written just for the Reservoir (see
// lib/dtuip-reservoir/client.ts's history), then extracted here on
// 2026-09-22 once it became clear the Well is the SAME account (same
// Tlinkappid/client_id+secret, same HOLYKELL_USERNAME/PASSWORD) as the
// Reservoir — just a different physical device. Unlike the Well's other
// client (lib/dtuip/client.ts, front.dtuip.com), this one logs in with a
// plain OAuth2 password grant: no CAPTCHA, no browser session, no manual
// bearer-token capture that quietly expires. As long as HOLYKELL_USERNAME
// / HOLYKELL_PASSWORD stay valid, this never needs re-capturing by hand.
//
// UNCONFIRMED for the Well specifically: this repo/sandbox has no network
// access to dtuip.com, so this couldn't be tested end-to-end before
// handing it over — it's a strong bet from the shared-account evidence,
// not a guarantee. app/api/sync/dtuip-well/route.ts tries this first and
// automatically falls back to the old lib/dtuip/client.ts approach if it
// fails, so nothing breaks if the old backend doesn't expose this device.

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  userId?: string | number;
  expires_in?: number;
  [key: string]: unknown;
}

const BASE_URL = "https://app.dtuip.com";

async function getAccessToken(): Promise<TokenResponse> {
  const clientId = process.env.DTUIP_RESERVOIR_CLIENT_ID;
  const clientSecret = process.env.DTUIP_RESERVOIR_CLIENT_SECRET;
  const username = process.env.HOLYKELL_USERNAME;
  const password = process.env.HOLYKELL_PASSWORD;
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error(
      "DTUIP_RESERVOIR_CLIENT_ID / DTUIP_RESERVOIR_CLIENT_SECRET / HOLYKELL_USERNAME / HOLYKELL_PASSWORD are not set in .env.local",
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "password", username, password });

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`dtuip OAuth token request failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) {
    throw new Error(`dtuip OAuth token response missing access_token: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

export interface DtuipOAuthSensor {
  sensorName: string;
  value: number | string;
  updateDate?: string;
  [key: string]: unknown;
}

interface DeviceDatasResponse {
  data?: { sensorsList?: DtuipOAuthSensor[]; updateDate?: string } | Array<{ sensorsList?: DtuipOAuthSensor[]; updateDate?: string }>;
  device?: { sensorsList?: DtuipOAuthSensor[]; updateDate?: string };
  [key: string]: unknown;
}

/**
 * Fetch one device's current sensor readings via app.dtuip.com — works for
 * any device on this Holykell account, identified by its dashboard
 * deviceId + deviceNo (serial number).
 */
export async function getDeviceDatas(
  deviceId: string,
  deviceNo: string,
): Promise<{ sensors: DtuipOAuthSensor[]; globalTime: string }> {
  const clientId = process.env.DTUIP_RESERVOIR_CLIENT_ID!;
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/api/device/getSingleDeviceDatas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${token.token_type ?? "Bearer"} ${token.access_token}`,
      tlinkAppId: clientId,
    },
    body: JSON.stringify({
      userId: token.userId ?? process.env.HOLYKELL_USERNAME,
      deviceId,
      deviceNo,
      currPage: 1,
      pageSize: 10,
    }),
  });

  if (!res.ok) {
    throw new Error(`dtuip getSingleDeviceDatas failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as DeviceDatasResponse;

  // Mirrors the recovered script's extract_sensor_data(): device object can
  // be under `device`, `data` (object), or `data[0]` (array) depending on
  // the exact endpoint version — check all three rather than guess one.
  const deviceObj = json.device ?? (Array.isArray(json.data) ? json.data[0] : json.data);
  const sensors = deviceObj?.sensorsList;
  if (!sensors || sensors.length === 0) {
    throw new Error(`dtuip getSingleDeviceDatas: no sensorsList for deviceId=${deviceId}. Raw body: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return { sensors, globalTime: deviceObj?.updateDate ?? "" };
}