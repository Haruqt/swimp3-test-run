import { NextResponse } from "next/server";
import { getLiveStreamUrl } from "@/lib/cctv/client";

/**
 * Exposes the CCTV live stream URL to the client player. Kept as its own
 * route rather than calling getLiveStreamUrl() directly from the browser,
 * since that function needs the server-side Easy4IP app secret.
 */
// Always run on request — never prerender this at build time or cache its response.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { url, protocol } = await getLiveStreamUrl();
    return NextResponse.json({ url, protocol });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error fetching live stream" },
      { status: 502 }
    );
  }
}