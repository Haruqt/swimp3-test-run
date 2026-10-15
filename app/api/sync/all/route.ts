import { NextRequest, NextResponse } from "next/server";
import { GET as syncWell } from "@/app/api/sync/dtuip-well/route";
import { GET as syncReservoir } from "@/app/api/sync/dtuip-reservoir/route";
import { GET as syncPressure } from "@/app/api/sync/xyt-pressure/route";
import { GET as syncMeter } from "@/app/api/sync/watermeter/route";
import { GET as syncCctv } from "@/app/api/sync/cctv/route";

/**
 * Single entry point for scheduling all 4 sensor syncs together, instead
 * of needing 4 separate cron entries. This is what turns "someone has to
 * open the sync URLs in a browser" into "actually automatic".
 *
 * Protected with CRON_SECRET so this can't be triggered by a random
 * request: whatever calls this (a cPanel cron job, Vercel Cron, an
 * external scheduler) must send it either as `?secret=...` or as an
 * `Authorization: Bearer ...` header.
 */
/** Five syncs run one after another — allow up to 60 s so the host does not cut it off. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const provided =
      req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const jobs: Array<{ name: string; fn: () => Promise<Response> }> = [
    { name: "dtuip-well", fn: () => syncWell() },
    { name: "dtuip-reservoir", fn: () => syncReservoir() },
    { name: "xyt-pressure", fn: () => syncPressure() },
    { name: "watermeter", fn: () => syncMeter() },
    { name: "cctv", fn: () => syncCctv() },
  ];

  const results: Record<string, unknown> = {};
  for (const job of jobs) {
    try {
      const res = await job.fn();
      results[job.name] = await res.json();
    } catch (err) {
      results[job.name] = { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}