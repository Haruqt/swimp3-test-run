import { SensorExplorer } from "@/components/map/SensorExplorer";
import { createClient } from "@/lib/supabase/server";
import type { Device, SensorReading } from "@/lib/types";
import { fetchLatestReadings } from "@/lib/supabase/fetchLatestReadings";

// Without this, Next.js can cache the Supabase fetch responses on this page
// indefinitely, so re-seeding the database (new sensor coordinates, etc.)
// wouldn't show up until a full rebuild — force it to hit the DB fresh
// every request instead.
export const dynamic = "force-dynamic";

export default async function SensorsMapPage() {
  const supabase = createClient();
  const [{ data: devices }, { data: readings }] = await Promise.all([
    supabase.from("devices").select("*"),
    fetchLatestReadings(supabase, { perSeries: 500, ascending: true }).then((data) => ({ data })),
  ]);

  return (
    <div className="flex flex-col">
      {/* Fixed vh-based height instead of flex-1 — flex-1 depends on every
          ancestor (layout.tsx, this page, SensorExplorer) correctly passing
          through a definite height, and that chain was silently collapsing
          to 0px height (confirmed via getBoundingClientRect in devtools:
          width was a real 1264px, height was exactly 0). A fixed height
          here doesn't depend on any ancestor at all — same fix already
          proven to work on the Data/Maps pages (HazardMapViewer's wrapper
          uses this same pattern). Tied to navbar height (now flush at
          top-0, ~80px total) instead of a flat 75vh guess, which left a
          visible gap of its own below the map on tall viewports now that
          the title block above is gone. */}
      <div className="h-screen w-full">
        <SensorExplorer
          devices={(devices as Device[]) ?? []}
          readings={(readings as SensorReading[]) ?? []}
        />
      </div>
    </div>
  );
}