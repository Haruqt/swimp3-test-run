/**
 * Seeds Supabase with realistic mock data so the app is fully demoable
 * while the physical sensors are offline for battery replacement.
 *
 * Run with: npm run seed
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding devices...");

  // NOTE ON COORDINATES: these are approximate placeholders spread along
  // the facility's diagonal footprint (Cauayan City Central Terminal /
  // BJMP-PNP compound), based on visual layout only — NOT surveyed GPS
  // coordinates. Swap in real values per device as soon as they're known
  // (that's the whole point of the lat/longitude columns on `devices`).
  const devices = [
    // Groundwater — the live site shows exactly 2 pins here (Well and
    // Reservoir, both using Gwmwell.png), not one per metric. The metrics
    // below (PH, TDS, etc.) are readings that belong to these 2 devices,
    // not separate mapped devices — that mismatch was causing 7 markers to
    // stack on top of each other into a blurred mess.
    //
    // CONFIRMED against a real screenshot of the live "Groundwater Recharge
    // Tank" panel (that title maps to the Reservoir via deviceTitleOverride):
    // the water quality metrics (pH/conductivity/TDS/salinity/temperature)
    // and Level Sensor both belong to the Reservoir, not the Well as
    // previously guessed. The Well's own real metric set is still
    // unconfirmed — no screenshot reference for it yet.
    { external_device_id: "GWWELL-01", name: "Ground Water Well", group_type: "groundwater_well", status: "online", latitude: 16.953034, longitude: 121.766655 },
    { external_device_id: "GWRES-01", name: "Ground Water Reservoir", group_type: "groundwater_reservoir", status: "online", latitude: 16.953021, longitude: 121.766547 },

    // Pressure sensors — real coordinates pulled from the live site via
    // console (map._layers marker positions), matched by title.
    { external_device_id: "233614968", name: "Pressure Sensor 4 (Bar)", group_type: "pressure", status: "online", latitude: 16.95258, longitude: 121.76677 },
    { external_device_id: "233614969", name: "Pressure Sensor 3 (Bar)", group_type: "pressure", status: "online", latitude: 16.952909, longitude: 121.765982 },
    { external_device_id: "233614970", name: "Pressure Sensor 1 (Bar)", group_type: "pressure", status: "online", latitude: 16.95184, longitude: 121.76739 },
    { external_device_id: "233614971", name: "Pressure Sensor 2 (Bar)", group_type: "pressure", status: "online", latitude: 16.953081, longitude: 121.766197 },
    { external_device_id: "233614972", name: "Pressure Sensor 5 (Bar)", group_type: "pressure", status: "offline", latitude: 16.95270, longitude: 121.76670 },

    // Smart water meters — real coordinates, same source as above.
    { external_device_id: "SWM-001", name: "Smart Water Meter 1", group_type: "smart_water_meter", status: "online", latitude: 16.953355, longitude: 121.766971 },
    { external_device_id: "SWM-002", name: "Smart Water Meter 2", group_type: "smart_water_meter", status: "online", latitude: 16.95301, longitude: 121.76626 },
    { external_device_id: "SWM-003", name: "Smart Water Meter 3", group_type: "smart_water_meter", status: "online", latitude: 16.95284, longitude: 121.7661 },
    { external_device_id: "SWM-004", name: "Smart Water Meter 4", group_type: "smart_water_meter", status: "online", latitude: 16.95309, longitude: 121.766195 },

    { external_device_id: "8K01F97PAZ7B7B1", name: "Storm Water Harvesting Facility", group_type: "cctv", status: "online", latitude: 16.95312, longitude: 121.766279 },
  ];

  // `upsert` only ever adds/updates rows matching the external_device_ids
  // below — it never removes rows that get dropped from this list. That's
  // exactly what caused the 7 old groundwater-metric devices to keep
  // rendering as ghost/overlapping markers after being replaced with 2 real
  // ones. Do a full sync instead: delete anything not in the current list
  // first, then upsert, so the DB always matches this file exactly.
  const currentIds = devices.map((d) => d.external_device_id);
  const { error: pruneError } = await supabase
    .from("devices")
    .delete()
    .not("external_device_id", "in", `(${currentIds.map((id) => `"${id}"`).join(",")})`);
  if (pruneError) throw pruneError;

  const { data: insertedDevices, error: deviceError } = await supabase
    .from("devices")
    .upsert(devices, { onConflict: "external_device_id" })
    .select();

  if (deviceError) throw deviceError;
  console.log(`Inserted ${insertedDevices.length} devices`);

  const byName = (n: string) => insertedDevices.find((d) => d.name === n)?.id;

  const readings = [
    { device_id: byName("Ground Water Reservoir"), metric: "ph", value: 9.65, unit: "ph", optimal_min: 6.5, optimal_max: 8.5 },
    { device_id: byName("Ground Water Reservoir"), metric: "temperature_ph", value: 60, unit: "°C", optimal_min: 15, optimal_max: 30 },
    { device_id: byName("Ground Water Reservoir"), metric: "conductivity", value: 0.029, unit: "ms/cm", optimal_min: 0.1, optimal_max: 2 },
    { device_id: byName("Ground Water Reservoir"), metric: "tds", value: 0.014, unit: "mg/L", optimal_min: 50, optimal_max: 500 },
    { device_id: byName("Ground Water Reservoir"), metric: "level", value: 3.2, unit: "m", optimal_min: 1, optimal_max: 10 },

    { device_id: byName("Pressure Sensor 1 (Bar)"), metric: "pressure", value: 2.0, unit: "bar" },
    { device_id: byName("Pressure Sensor 2 (Bar)"), metric: "pressure", value: 1.8, unit: "bar" },
    { device_id: byName("Pressure Sensor 3 (Bar)"), metric: "pressure", value: 2.1, unit: "bar" },
    { device_id: byName("Pressure Sensor 4 (Bar)"), metric: "pressure", value: 1.9, unit: "bar" },

    { device_id: byName("Smart Water Meter 1"), metric: "flow", value: 4.6, unit: "m³" },
    { device_id: byName("Smart Water Meter 2"), metric: "flow", value: 3.9, unit: "m³" },
    { device_id: byName("Smart Water Meter 3"), metric: "flow", value: 5.1, unit: "m³" },
    { device_id: byName("Smart Water Meter 4"), metric: "flow", value: 4.2, unit: "m³" },
  ].filter((r) => r.device_id);

  const { error: readingError } = await supabase.from("sensor_readings").insert(readings);
  if (readingError) throw readingError;
  console.log(`Inserted ${readings.length} readings`);

  console.log("Seeding the 5 real alerts confirmed via swimproject3.com/home...");
  // Made idempotent: previously a plain .insert() with no duplicate check,
  // so every re-run of this seed script added another identical row —
  // that's why the dashboard was showing this same alert 5 times over.
  // Clear out any prior copies by title before inserting the current ones.
  //
  // These 5 exact alerts (title/description/root_cause) were confirmed via
  // a real screenshot of the live site's Hub — replacing the earlier
  // single made-up "Pressure Sensor 5 offline" demo alert, which doesn't
  // match what the real site actually shows (it shows ps1/ps3/ps4, not
  // ps5, plus the smart-meter and water-quality alerts below).
  const realAlerts: Record<string, unknown>[] = [
    {
      title: "Pressure sensor ps1 offline - Data from 1 year ago",
      description: "Check sensor power and communication lines",
      root_cause: "stale",
      recommended_actions: ["Check power supply", "Verify communication cables", "Restart sensor gateway"],
      severity: "high" as const,
      estimated_time: "1-2 hours",
      related_device_id: byName("Pressure Sensor 1 (Bar)"),
    },
    {
      title: "Pressure sensor ps3 offline - Data from 1 year ago",
      description: "Check sensor power and communication lines",
      root_cause: "stale",
      recommended_actions: ["Check power supply", "Verify communication cables", "Restart sensor gateway"],
      severity: "high" as const,
      estimated_time: "1-2 hours",
      related_device_id: byName("Pressure Sensor 3 (Bar)"),
    },
    {
      title: "Pressure sensor ps4 offline - Data from 1 year ago",
      description: "Check sensor power and communication lines",
      root_cause: "stale",
      recommended_actions: ["Check power supply", "Verify communication cables", "Restart sensor gateway"],
      severity: "high" as const,
      estimated_time: "1-2 hours",
      related_device_id: byName("Pressure Sensor 4 (Bar)"),
    },
    {
      title: "All smart meters cannot connect to server 47.103.146.199:6071",
      description: "Check server connectivity and firewall settings",
      root_cause: "connection_error",
      recommended_actions: ["Check server uptime", "Verify firewall rules", "Confirm network route to 47.103.146.199"],
      severity: "immediate" as const,
      estimated_time: "1-2 hours",
      related_device_id: null,
    },
    {
      title: "4 water quality sensors not reporting live data",
      description: "Check groundwater monitoring well connectivity",
      root_cause: "partial_data",
      recommended_actions: ["Check well device connectivity", "Verify sensor wiring", "Confirm gateway is online"],
      severity: "medium" as const,
      estimated_time: "1-2 hours",
      related_device_id: byName("Ground Water Well"),
    },
  ];

  for (const alert of realAlerts) {
    await supabase.from("alerts").delete().eq("title", alert.title);
    await supabase.from("alerts").insert(alert);
  }

  console.log("Seeding hazard maps...");
  await supabase.from("hazard_maps").upsert(
    [
      {
        slug: "100yr",
        title: "Flood Hazard Map Under 100-year Rain Return Period",
        description:
          "This shapefile, with a resolution of 10 meters, illustrates the inundation extents in the area if the actual amount of rain exceeds that of a 100-year rain return period. There is a 1/100 (1%) probability of a flood with a 100-year return period occurring in a single year.",
        category: "flood",
        thumbnail_url: "/images/maps/flood-100yr-thumb.png",
        // Real hazard polygons, extracted from the live site's own
        // qgis2web export (CauayanFH100YRRRP_4.js) and filtered down to just
        // the 3 real hazard classes (dropped the "no hazard"/background
        // classes, which rendered fully transparent anyway and cost ~4.7MB
        // for nothing). Colored in HazardMapViewer by the hazard_level
        // property this file carries — no bounds-guessing needed at all
        // since these are the exact real coordinates.
        geojson_url: "/geo/flood-100yr.json",
        legend: [
          { label: "Low Hazard", color: "#FFD500", range: "0.1m-0.5m" },
          { label: "Medium Hazard", color: "#FF7A00", range: "0.5m-1.5m" },
          { label: "High Hazard", color: "#FF1E1E", range: "beyond 1.5m" },
        ],
      },
      {
        slug: "25yr",
        title: "Flood Hazard Map Under 25-year Rain Return Period",
        description:
          "This shapefile, with a resolution of 10 meters, illustrates the inundation extents in the area if the actual amount of rain exceeds that of a 25-year rain return period. There is a 1/25 (4%) probability of a flood with a 25-year return period occurring in a single year.",
        category: "flood",
        thumbnail_url: "/images/maps/flood-25yr-thumb.png",
        // Same qgis2web extraction as 100yr (CauayanFH25YRRRP_4.js), same
        // Var -> hazard_level mapping confirmed against the source data.
        geojson_url: "/geo/flood-25yr.json",
        legend: [
          { label: "Low Hazard", color: "#FFD500", range: "0.1m-0.5m" },
          { label: "Medium Hazard", color: "#FF7A00", range: "0.5m-1.5m" },
          { label: "High Hazard", color: "#FF1E1E", range: "beyond 1.5m" },
        ],
      },
      {
        slug: "5yr",
        title: "Flood Hazard Map Under 5-year Rain Return Period",
        description:
          "This shapefile, with a resolution of 10 meters, illustrates the inundation extents in the area if the actual amount of rain exceeds that of a 5-year rain return period. There is a 1/5 (20%) probability of a flood with a 5-year return period occurring in a single year.",
        category: "flood",
        thumbnail_url: "/images/maps/flood-5yr-thumb.png",
        // Same qgis2web extraction as 100yr (CauayanFH5YRRRP_5.js), same
        // Var -> hazard_level mapping confirmed against the source data.
        geojson_url: "/geo/flood-5yr.json",
        legend: [
          { label: "Low Hazard", color: "#FFD500", range: "0.1m-0.5m" },
          { label: "Medium Hazard", color: "#FF7A00", range: "0.5m-1.5m" },
          { label: "High Hazard", color: "#FF1E1E", range: "beyond 1.5m" },
        ],
      },
      {
        slug: "GroundShakingHazardMap",
        title: "Ground Shaking Hazard Map",
        description:
          "A composite map of estimated maximum intensities for various earthquake scenarios that may affect the study area, determined using a deterministic method based on instrumental seismicity, historical seismicity, and mapped active earthquake generators.",
        category: "seismic",
        thumbnail_url: "/images/maps/groundshaking-thumb.png",
      },
      {
        slug: "LiquefactionHazardMap",
        title: "Liquefaction Hazard Map",
        description:
          "Based on the geology, earthquake source zone, historical accounts of liquefaction, geomorphology, and hydrology of the area, with preliminary microtremor survey data used to validate the type of underlying materials.",
        category: "seismic",
        thumbnail_url: "/images/maps/liquefaction-thumb.png",
      },
    ],
    { onConflict: "slug" }
  );

  console.log("Seeding staff with real photo filenames...");
  // Clear existing rows first since there's no unique constraint on
  // `name` to upsert against — re-running this script should still
  // be idempotent.
  const { error: staffDeleteError } = await supabase
    .from("staff")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (staffDeleteError) throw staffDeleteError;

  const { error: staffInsertError } = await supabase.from("staff").insert([
    { name: "Dr. Rafael Padre", role: "Project Leader", is_lead: true, sort_order: 0, photo_url: "/images/staff/Dr-Rafael-Padre-Project-Leader.png" },
    { name: "Dr. Edward Panganiban", role: "Project Staff", sort_order: 1, photo_url: "/images/staff/Engr-Edward-Panganiban-Project-Staff.png" },
    { name: "Engr. Oliver Francisco", role: "Project Staff", sort_order: 2, photo_url: "/images/staff/Engr-Oliver-Francisco-Project-Staff.png" },
    { name: "Engr. Melanie Baguio", role: "Project Staff", sort_order: 3, photo_url: "/images/staff/Engr-Melanie-Baguio-Project-Staff.png" },
    { name: "Engr. Rudy Panganiban", role: "Science Research Specialist 1", sort_order: 4, photo_url: "/images/staff/Rudy-Panganiban.png" },
    { name: "Engr. Robert Magallano", role: "Science Research Specialist 1", sort_order: 5, photo_url: "/images/staff/Robert-Magalano.png" },
    { name: "Engr. Kathleen Palma", role: "Science Research Assistant", sort_order: 6, photo_url: "/images/staff/Engr-Kathleen-Palma.png" },
    { name: "Rogelio Sabellano", role: "Science Research Assistant", sort_order: 7, photo_url: "/images/staff/Rogelio-Sabellano.png" },
    { name: "Gretchen Bondoc", role: "Clerk/Logistics", sort_order: 8, photo_url: "/images/staff/Gretchen-Bondoc.png" },
  ]);
  if (staffInsertError) throw staffInsertError;
  console.log("Inserted 9 staff rows");

  console.log("Done seeding.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});