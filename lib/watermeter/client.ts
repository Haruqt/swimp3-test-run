// Real client for the smart water meter platform behind tykjiot.com.
// Recovered from the old dev PC's working Laravel app
// (smartwatermeterControlleradmin.php), which called this successfully in
// production — not guessed.
//
// This is the simplest of the three remaining integrations: one POST with
// the account username/password directly in the JSON body, no session, no
// token, nothing to refresh. The old code called the *IP* endpoint
// (47.103.146.199:6071) rather than the tykjiot.com domain from the
// handoff notes — keep using the IP since that's what's confirmed working,
// and treat the domain as an alternate hostname for the same backend.

const METER_DATA_URL = "http://47.103.146.199:6071/WebHttpApi_EN/TYGetMeterData.ashx";

export interface MeterReading {
  MeterId: string;
  PositiveCumulativeFlow: string | number;
  PositiveInstantaneousFlow: string | number;
  AntiCumulativeFlow: string | number;
  AntiInstantaneousFlow: string | number;
  CommunicationTime: string;
  ValveStatus: string | number;
  MeterVoltage: string | number;
  SignalIntensity: string | number;
  PipelinePressure: string | number;
  [key: string]: unknown;
}

interface MeterDataResponse {
  MeterDataList?: MeterReading[];
  [key: string]: unknown;
}

/**
 * Fetch current readings for the given meter IDs in one call.
 * Confirmed real meter IDs (from the old code's device-name map):
 *   62992212211172, 62992212211173, 62992212211174, 62992212211175
 */
export async function getMeterData(meterIds: string[]): Promise<MeterReading[]> {
  const username = process.env.WATERMETER_USERNAME;
  const password = process.env.WATERMETER_PASSWORD;
  if (!username || !password) {
    throw new Error("WATERMETER_USERNAME / WATERMETER_PASSWORD are not set in .env.local");
  }

  const res = await fetch(METER_DATA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      MeterIdList: meterIds,
      UserName: username,
      PassWord: password,
    }),
  });

  if (!res.ok) {
    throw new Error(`Water meter API failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as MeterDataResponse;
  if (!Array.isArray(json.MeterDataList)) {
    throw new Error(`Water meter API: unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json.MeterDataList;
}