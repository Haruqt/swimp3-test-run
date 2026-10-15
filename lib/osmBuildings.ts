// "Buildings CCC Bus Station" layer — these are literal OSM building
// footprints (Cauayan City Central Bus Terminal, PNP Station, BJMP Cauayan
// City Jail, and the handful of other structures in that immediate cluster),
// not a PSGC administrative boundary. We pull them live from the Overpass
// API rather than hand-tracing, so they stay accurate if OSM data improves.
//
// Bounding box is eyeballed from the reference screenshot / the existing
// facilityBoundary placeholder in SensorMap.tsx (~centered on 16.953,
// 121.766). Widen this if buildings at the edges of the reference image
// turn out to be clipped.
export const BUILDINGS_BBOX = {
  south: 16.949,
  west: 121.758,
  north: 16.958,
  east: 121.769,
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeomPoint[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

let cached: Promise<GeoJSON.Feature[]> | null = null;

/**
 * Fetch building footprints (way[building=*]) within BUILDINGS_BBOX and
 * convert them to GeoJSON polygons. Cached for the session; returns [] on
 * any failure so the caller can just render nothing rather than crash.
 */
export async function fetchBuildingFootprints(): Promise<GeoJSON.Feature[]> {
  if (!cached) {
    const { south, west, north, east } = BUILDINGS_BBOX;
    const query = `[out:json][timeout:25];(way["building"](${south},${west},${north},${east}););out geom;`;

    cached = fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
        return res.json();
      })
      .then((data: OverpassResponse) =>
        data.elements
          .filter((el) => el.geometry && el.geometry.length > 2)
          .map((el): GeoJSON.Feature => ({
            type: "Feature",
            id: el.id,
            properties: el.tags ?? {},
            geometry: {
              type: "Polygon",
              coordinates: [el.geometry!.map((pt) => [pt.lon, pt.lat])],
            },
          }))
      );
    // Don't cache a rejected fetch — let the next toggle retry.
    cached.catch(() => {
      cached = null;
    });
  }
  try {
    return await cached;
  } catch {
    return [];
  }
}